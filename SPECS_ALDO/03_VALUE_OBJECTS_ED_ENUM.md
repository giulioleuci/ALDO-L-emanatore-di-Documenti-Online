# 03 — Value Object ed Enum

I **Value Object** sono oggetti immutabili privi di identità persistente: una volta costruiti NON DEVONO MAI essere mutati. Vengono costruiti a partire da dati grezzi e DEVONO essere validati nel costruttore; qualsiasi violazione dei vincoli DEVE produrre un'eccezione esplicita. NON hanno ciclo di vita proprio nel database.

Gli **Enum** sono insiemi fissi di valori ammissibili per un campo. Un valore fuori dall'insieme ammesso NON DEVE MAI essere accettato. Sono usati sia come tipo dei Value Object sia direttamente come vincoli di colonna nel database.

---

## 1. Enum

### `ReligioneScelta`

**Utilizzo:** `ALUNNI.RELIGIONE`

| Valore | Significato                                 |
| ------ | ------------------------------------------- |
| `IRC`  | Lo studente si avvale dell'insegnamento IRC |
| `NO`   | Lo studente non si avvale dell'IRC          |
| `ALT`  | Lo studente sceglie un'attività alternativa |

**Default:** `IRC` se non specificato.

### `GestioneArticolazione`

**Utilizzo:** `CONF_DOC.GESTIONE_ARTICOLAZIONE`

| Valore       | Significato                                    |
| ------------ | ---------------------------------------------- |
| `ARTICOLATA` | Considera le classi componenti l'articolazione |
| `COMPLETA`   | Considera la classe nella sua totalità         |

**Default:** `COMPLETA` se non specificato.

### `GeneratoreAxis`

**Utilizzo:** `CONF_DOC.GENERATORE` — pilota esclusivamente l'asse di iterazione del batch (`DocumentBatchService.batchGenerateHandler`) e la recipe CDU attiva; non è un nome di strategia/registrazione (vedi nota "Semantica di `GENERATORE`" in `01_SCHEMA_DATABASE.md` §CONF_DOC).

| Valore                   | Asse di iterazione                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| `CLASSE`                 | Una generazione per classe                                                 |
| `DOCENTE`                | Una generazione per docente                                                |
| `PIANO_PERSONALIZZATO`   | Una generazione per riga `PIANI` (studente × tipo)                         |
| `CLASSE_MATERIA`         | Una generazione per coppia classe/materia                                  |
| `CLASSE_DOCENTE`         | Una generazione per coppia classe/docente                                  |
| `CLASSE_DOCENTE_MATERIA` | Una generazione per cattedra (classe/docente/materia)                      |
| `DIPARTIMENTO`           | Una generazione per dipartimento                                           |
| `ALUNNO`                 | Una generazione per alunno attivo                                          |

Nessun valore ammette colonne materie (`PARAMETRI.aggiungiMaterie`/`aggiungiMaterieConPermessi`) sull'asse `DIPARTIMENTO` (nessun consiglio di classe da cui derivarle — vedi validazione costruttore in `01_SCHEMA_DATABASE.md` §CONF_DOC).

### `TipoIstituto`

**Utilizzo:** `INDIRIZZI.TIPO`

| Valore          | Significato                                                |
| --------------- | ---------------------------------------------------------- |
| `LICEO`         | Liceo (classico, scientifico, linguistico, musicale, ecc.) |
| `ITS`           | Istituto Tecnico Superiore                                 |
| `IEFP`          | Istruzione e Formazione Professionale                      |
| `PROFESSIONALE` | Istituto Professionale                                     |
| `TECNICO`       | Istituto Tecnico                                           |

### `DuplicazioneDocumento`

**Utilizzo:** `CONF_DOC.DUPLICAZIONE`

| Valore     | Significato                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `NEGATA`   | Default. Blocca la generazione se esiste la stessa identità `TIPO`+`SOTTOTIPO`+`ID_GEN`+`PATH`+`NOME_NORMALIZZATO`. Per calcolare `NOME_NORMALIZZATO`, ogni controllo sceglie un marker alfanumerico temporaneo assente dal `FILE_NAME` completo reso con lo stesso CDU e un valore-sonda non vuoto per `progressivo`, sostituisce solo i token esatti `{{progressivo}}`, rende il template completo e tratta solo il marker scelto come sequenza numerica. Il marker non è persistito. |
| `PERMESSA` | Consente una nuova generazione senza eseguire il controllo dei duplicati.                         |

Il controllo è applicato da `CheckDuplicatesStep` (`src/application/pipelines/documentSteps.ts`).
Per i documenti `PIANO_PERS`, la corrispondenza richiede inoltre lo stesso studente risolto in
`LOG_DOCS.UTENTI`, così piani dello stesso sottotipo appartenenti ad alunni diversi restano distinti.

**Default:** `NEGATA`.

---

### `Genere`

**Utilizzo:** `DOCENTI.GENERE`

| Valore | Appellativo generato |
| ------ | -------------------- |
| `M`    | `Prof.`              |
| `F`    | `Prof.ssa`           |

**Default:** `F` se non specificato.

---

### `FormatoOutput`

**Utilizzo:** `CONF_DOC.FORMATO`

| Valore   | Tipo file prodotto        |
| -------- | ------------------------- |
| `GDOC`   | Google Doc                |
| `GSHEET` | Google Sheet              |
| `PDF`    | PDF esportato da Drive    |
| `TEXT`   | File txt salvato da Drive |

---

### `ProcessoInvio`

**Utilizzo:** `CONF_MAIL.PROCESSO`

| Valore                          | Destinatari                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| `PER_COORDINATORE`              | Un'email per coordinatore, aggregando tutte le sue classi         |
| `PER_DOCENTE`                   | Un'email per docente del CdC, aggregando tutte le sue classi      |
| `PER_CDC`                       | Un'email multi-TO per classe, a tutti i docenti del CdC           |
| `PER_ALUNNO`                    | Un'email per alunno attivo                                        |
| `PER_GENITORI_ALUNNO`           | Un'email per famiglia (deduplicata per set di tutori)             |
| `PER_CARENZA_GENITORI`          | Un'email per riga CARENZE non notificata, ai soli genitori/tutori |
| `PER_CARENZA_GENITORI_E_ALUNNO` | Come sopra, TO genitori + alunno (un'unica email condivisa)       |
| `PER_CARENZA_GENITORI_E_COORD`  | Come `PER_CARENZA_GENITORI`, con il coordinatore di classe in CC  |
| `PER_CAPO_DIPARTIMENTO`         | Un'email per dipartimento con un `CAPO` assegnato, indirizzata al solo capo |
| `PER_DIPARTIMENTO`              | Un'email per dipartimento, a tutti i docenti afferenti            |

Le tre varianti `PER_CARENZA_GENITORI*` condividono la stessa iterazione su `CARENZE` non notificate
e possono usare solo i box `carenze`/`note`/`assenze`.

---

### `GestioneSupplenti`

**Utilizzo:** `CONF_MAIL.SUPPLENTI`, `CONF_DOC.PERMESSI.regolaSupplente`

| Valore           | Comportamento                                                               |
| ---------------- | --------------------------------------------------------------------------- |
| `SOLO_TITOLARI`  | Ignora supplenti; solo il titolare è destinatario/beneficiario              |
| `SOLO_SUPPLENTI` | Se c'è un supplente attivo, sostituisce il titolare; altrimenti il titolare |
| `ENTRAMBI`       | Titolare e supplente sono entrambi inclusi                                  |

---

### `TipoPiano`

**Utilizzo:** `PIANI.TIPO`

| Valore          | Significato                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `PDP_DSA`       | Piano Didattico Personalizzato per DSA                                                                    |
| `PDP_BES`       | Piano Didattico Personalizzato per BES non DSA                                                            |
| `PDP_STRANIERI` | Piano Didattico Personalizzato per studenti di origine straniera                                          |
| `PEI`           | Piano Educativo Individualizzato (per disabilità)                                                         |
| `PFP`           | Piano Formativo Personalizzato (per studenti atleti), unico che non comporta essere BES secondo normativa |

Ogni `TipoPiano`, ECCETTO `PFP`, implica SEMPRE un bisogno educativo speciale (BES); `PFP` NON implica MAI BES.

---

### `TipoProgetto`

**Utilizzo:** `PROGETTI.TIPO`

| Valore         | Descrizione                                       |
| -------------- | ------------------------------------------------- |
| `ASL`          | Alternanza Scuola Lavoro / PCTO                   |
| `ORIENTAMENTO` | Attività di orientamento universitario/lavorativo |
| `ALTRO`        | Altre attività extracurricolari                   |

---

### `TipoMovimento`

**Utilizzo:** `MOV_ALUNNI.TIPO`

| Valore     | Descrizione                                          |
| ---------- | ----------------------------------------------------- |
| `IN`       | Ingresso da altra scuola o classe                      |
| `OUT`      | Uscita per trasferimento verso altro istituto          |
| `RITIRATO` | Uscita per ritiro dagli studi (non verso altra scuola) |
| `CAMBIO`   | Cambio di classe interno all'istituto                  |

---

### `StatoDocumento`

**Utilizzo:** `LOG_DOCS.STATO`

| Valore         | Descrizione                                               |
| -------------- | --------------------------------------------------------- |
| `GENERATO`     | Documento creato su Drive, non ancora verbalizzato        |
| `VERBALIZZATO` | Documento inserito nei verbali di riferimento             |
| `NOTIFICATO`   | Documento inviato via email agli utenti responsabili      |
| `ARCHIVIATO`   | Documento archiviato; non più attivo nel flusso operativo |

Transizione tipica: `GENERATO` → `VERBALIZZATO/NOTIFICATO` → `ARCHIVIATO`.

---

### `StatoEmail`

**Utilizzo:** `LOG_MAIL.STATO`

| Valore    | Descrizione                                   |
| --------- | --------------------------------------------- |
| `SUCCESS` | Email inviata correttamente                   |
| `ERROR`   | Invio fallito (dettaglio in `ERRORE`)         |
| `PENDING` | In attesa di invio (usato nei processi batch) |

---

### `RuoloDocente`

**Utilizzo:** valore calcolato a runtime dal `ClasseRepository`. Non è un campo persistito in `CLASSI.ARTICOLAZIONE`. Indica il ruolo del docente nel contesto di una classe articolata.

| Valore             | Significato nel contesto articolato                   |
| ------------------ | ----------------------------------------------------- |
| `COMUNE`           | Il docente è condiviso tra entrambe le classi partner |
| `SEPARATO_PRIMO`   | Il docente appartiene alla prima classe partner       |
| `SEPARATO_SECONDO` | Il docente appartiene alla seconda classe partner     |

---

### Navigazione classi articolate (`IClasseRepository`)

Non esiste un parametro `articolazione?: 'partner' | 'parent'` su un metodo generico — la
navigazione tra classe parent e classi partner è esposta da metodi dedicati su
`IClasseRepository` (ref 06 §3), ciascuno con direzione fissa:

| Metodo                          | Input → Output                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `getClasseParent(classe)`        | Da una classe partner (es. `4A-LC`) → la classe parent (`4A`), o `null` se non articolata    |
| `getClassiPartner(classe)`       | Da una classe parent → le sue classi partner componenti                                      |
| `orderedPartners(classe)`        | Da QUALSIASI classe del gruppo → `[primo, secondo]` partner in ordine canonico               |
| `getGruppoArticolazione(classe)` | Da QUALSIASI classe del gruppo → tutte le classi del gruppo (parent + partner)               |
| `isArticolata(classe)`           | La classe (parent o partner) appartiene a un gruppo articolato                               |

`DocenteRepository`/`AlunnoRepository` non replicano questa navigazione: i consumatori applicativi (es. `tipoArticolazione()` in `TeachingCouncilProjection.ts`) usano direttamente `IClasseRepository`.

---

### `PermessoACL`

**Utilizzo:** `CONF_DOC.PERMESSI` (campo `permesso`)

| Valore      | Permesso Drive corrispondente |
| ----------- | ----------------------------- |
| `SCRITTURA` | `writer`                      |
| `LETTURA`   | `reader`                      |
| `COMMENTO`  | `commenter`                   |

**Default:** `LETTURA` se non specificato.

---

## 2. Value Object — Identificatori

### `Email`

- **Tipo base:** string
- **Validazione:** formato RFC 5321 (local-part@domain)

---

### `ClasseId`

- **Tipo base:** string
- **Validazione:** stringa non vuota. Il formato dipende dalle convenzioni dell'istituto (es. `5ALC`, `3B`, `4C-LC`). Nessun vincolo di pattern imposto dal sistema.

---

### `MateriaId`

- **Tipo base:** string
- **Validazione:** solo caratteri maiuscoli, lunghezza 2–10 caratteri

---

### `SpecificitaId`

- **Tipo base:** string
- **Formato:** `MateriaId.SPECIFICA` (es. `INTERPRETAZIONE.CHITARRA`)
- **Struttura:** un `MateriaId` valido, un punto letterale, e una stringa maiuscola non vuota
- **Metodi principali:**
  - `getMateriaPadre(): MateriaId` — restituisce la parte prima del punto
  - `getSpecifica(): string` — restituisce la parte dopo il punto
- **Uso:** nomi di colonne specificità nelle tabelle `CLASSI` e `CARENZE` (es. colonna `INTERPRETAZIONE.CHITARRA`)

---

### `IndirizzoId`

- **Tipo base:** string

---

### `DipartimentoId`

- **Tipo base:** string
- **Validazione:** deve corrispondere a un `ID` esistente nella tabella `DIPART`

---

### `DriveFileId`

- **Tipo base:** string
- **Validazione:** non vuoto
- **Metodi principali:**
  - `getUrl(): string` — costruisce l'URL Google Drive del file

---

### `DriveFolderId`

- **Tipo base:** string
- **Validazione:** non vuoto
- **Metodi principali:**
  - `getUrl(): string` — costruisce l'URL Google Drive della cartella

---

### `CarenzaId`

- **Tipo base:** string composita nel formato `"EMAIL_PROGRESSIVO"` (es. `"mario@school.it_3"`)
- **Struttura:** concatenazione di `ALUNNI.EMAIL + "_" + CARENZE.PROGRESSIVO` (`PROGRESSIVO` è un Integer, vedi `01_SCHEMA_DATABASE.md`)
- **Regola di parsing:** poiché la local-part di una email può contenere `_`, il parsing individua il separatore cercando l'**ultima** occorrenza di `_` nella stringa: tutto ciò che segue deve essere interamente numerico (`PROGRESSIVO`); tutto ciò che precede è `EMAIL`. Se l'ultima occorrenza di `_` non è seguita da una sequenza numerica valida, il `CarenzaId` è malformato.
- **Validazione:** non vuoto

---

### `DataRilevazione`

- **Tipo base:** Date
- **Validazione:** data valida; convenzionalmente corrisponde alla data del pagellino periodico

---

### `TipoDocumento`

- **Tipo base:** string
- **Validazione:** deve corrispondere a un valore presente nella colonna `CONF_DOC.TIPO`
- **Esempi:** `"VERBALE"`, `"PIANO_PERS"`, `"PIANO_LAVORO"`

> **Eccezione obbligatoria da non confondere con la natura libera della
> stringa:** per la configurazione unica `PIANI_PERSONALIZZATI`, `TipoDocumento`
> DEVE essere esattamente `"PIANO_PERS"`. I valori di `TipoPiano` non sono
> `TipoDocumento`: diventano `LOG_DOCS.SOTTOTIPO` e selezionano il ramo di
> `CONF_DOC.MODELLI` tramite `focus.piano.tipo`. Configurazioni separate per
> sottotipo e `CONF_DOC.PARAMETRI.tipoPiano` sono vietate.

---

## 3. Value Object — Complessi

### `AnnoCorso`

- **Proprietà:** `value: number` — intero nell'intervallo [1, 5]
- **Invariante:** `value` DEVE essere compreso tra 1 e 5, estremi inclusi

| Metodo                                   | Comportamento                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `isPrima(): boolean`                     | `true` se `value === 1`                                                                                                                                      |
| `isSeconda(): boolean`                   | `true` se `value === 2`                                                                                                                                      |
| `isPrimoBiennio(): boolean`              | `true` se `value` ∈ {1, 2}                                                                                                                                   |
| `isSecondoBiennio(): boolean`            | `true` se `value` ∈ {3, 4}                                                                                                                                   |
| `isTerminale(): boolean`                 | `true` se `value === 5` (approssimazione per corsi quinquennali). Per corsi quadriennali/IeFP, usare `ClassiTerminaliSpec` che interroga `CLASSI.TERMINALE`. |
| `getAnnoSuccessivo(): AnnoCorso \| null` | `null` se terminale; altrimenti `AnnoCorso(value + 1)`                                                                                                       |
| `getAnnoPrecedente(): AnnoCorso \| null` | `null` se classe prima; altrimenti `AnnoCorso(value - 1)`                                                                                                    |

---

### `AnnoScolastico`

- **Proprietà:** `value: string` — formato `YYYY-YYYY`
- **Invariante:** l'anno finale DEVE essere uguale all'anno iniziale + 1

| Metodo                                   | Comportamento                                              |
| ---------------------------------------- | ---------------------------------------------------------- |
| `getAnnoInizio(): number`                | Prima parte dell'anno scolastico                           |
| `getAnnoFine(): number`                  | Seconda parte dell'anno scolastico                         |
| `getAnnoSuccessivo(): AnnoScolastico`    | Anno scolastico successivo (es. `2024-2025` > `2025-2026`) |
| `getAnnoPrecedente(): AnnoScolastico`    | Anno scolastico precedente (es. `2024-2025` > `2023-2024`) |
| `equals(other: AnnoScolastico): boolean` | Confronto per valore                                       |

---

### `PeriodoSupplenza`

- **Proprietà:** `dal: Date`, `al: Date`
- **Invariante:** DEVE valere `dal ≤ al`

| Metodo                             | Comportamento                       |
| ---------------------------------- | ----------------------------------- |
| `contiene(data: Date): boolean`    | `true` se `dal ≤ data ≤ al`         |
| `durata(): number`                 | Numero di giorni interi del periodo |
| `isAttiva(oggi: Date): boolean`    | `contiene(oggi)`                    |
| `isTerminata(oggi: Date): boolean` | `al < oggi`                         |

---

### `ArticolazioneConfig`

- **Struttura JSON di origine** (da `CLASSI.ARTICOLAZIONE`):

```json
{
  "parent": "ClasseId | null",
  "partner": "ClasseId | null",
  "partners": ["ClasseId", "ClasseId"] | null  // esattamente due elementi quando presente, mai più o meno; l'ordine determina PRIMO/SECONDO gruppo
}
```

L'ordine dell'array in `partners` determina PRIMO e SECONDO gruppo (`IClasseRepository.orderedPartners`, `02_CDU_STRUTTURA.md`).

- **Invarianti di configurazione:**
  - `partners`, quando presente, DEVE contenere ESATTAMENTE due `ClasseId`; un'articolazione con un numero diverso di partner NON è supportata.

**Nota:** `materieCondivise`, `materieSeparatePrimoGruppo` e `materieSeparateSecondoGruppo` (esposti nel CDU come `focus.classe.articolazione.*`, vedi `02_CDU_STRUTTURA.md`) non sono campi persistiti in `CLASSI.ARTICOLAZIONE`: sono calcolati a runtime dal `ClasseRepository` confrontando le colonne docente delle classi partner. L'invariante "il calcolo delle materie condivise e separate deve produrre intersezioni sempre vuote" è quindi un invariante della `Classe`/`ClasseRepository`, non di questo Value Object.

---

### `RuoliClasse`

- **Struttura JSON di origine** (da `CLASSI.RUOLI`): `{ [nomeRuolo: string]: string }` — nome ruolo → email docente (singola) oppure CSV di email docenti per ruoli a titolarità multipla (es. `TUTOR_ASL`, `TUTOR_ORIENT`)

| Metodo                                       | Comportamento                                                                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getEmails(nomeRuolo: string): Email[]`      | Array delle email associate al ruolo: parsa il valore come CSV e restituisce tutti gli elementi. Array vuoto se il ruolo non è configurato o il valore è null/vuoto. **Metodo principale: preferire sempre questo in qualsiasi contesto.** |
| `getEmail(nomeRuolo: string): Email \| null` | Scorciatoia per `getEmails(nomeRuolo)[0] ?? null`. Usare solo per ruoli noti a titolare singolo (es. `SEGRETARIO`).                                                                                                                        |
| `hasRuolo(nomeRuolo: string): boolean`       | `true` se il ruolo esiste e il valore associato non è null né stringa vuota                                                                                                                                                                |

> **NOTA DI IMPLEMENTAZIONE:** Il parsing del CSV nel valore di `CLASSI.RUOLI` deve usare le utility di `CoreUtilsLib` (L0) per la gestione robusta di spazi, caratteri di escape e separatori. Non usare `String.split(',')` nudo.

---

### `EsameConfig`

- **Struttura JSON di origine** (da `MATERIE.ESAME_CFG`):

```json
{
  "primaProva": ["IndirizzoId", ...],
  "secondaProva": ["IndirizzoId", ...]
}
```

| Metodo                                                  | Comportamento                              |
| ------------------------------------------------------- | ------------------------------------------ |
| `isPrimaProvaPerIndirizzo(ind: IndirizzoId): boolean`   | `true` se l'indirizzo è in `primaProva`   |
| `isSecondaProvaPerIndirizzo(ind: IndirizzoId): boolean` | `true` se l'indirizzo è in `secondaProva` |

---

### `CsvScope`

- **Costruzione:** `static of(raw: unknown): CsvScope` — stato interno privato (`wildcard`/`values`), nessuna proprietà pubblica `value`; il raw è una CSV di ID oppure `"*"` (tutte)
- Unico VO generico che copre sia lo scope-classi sia lo scope-materie (usato in `SUPPLENZE.CLASSI`/`SUPPLENZE.MATERIE` e in `VARIAZIONI_CATTEDRA.CLASSI`/`VARIAZIONI_CATTEDRA.MATERIE`); in precedenza descritto come due VO gemelli (`ClassiScope`, `MaterieScope`), unificati in `src/domain/value-objects/CsvScope.ts`.

| Metodo                                 | Comportamento                                        |
| --------------------------------------- | ----------------------------------------------------- |
| `isWildcard(): boolean`                 | `true` se `value === "*"`                             |
| `applica(id: string): boolean`          | `true` se il valore è `"*"` oppure se `id` è nel CSV  |
| `overlaps(other: CsvScope): boolean`    | `true` se i due scope si intersecano (o uno dei due è totale) |

---

### `AllegatiInfo`

- **Struttura JSON di origine** (da `LOG_MAIL.ALLEGATI`):

```json
{
  "docs": ["DriveFileId", ...],
  "folders": ["DriveFolderId", ...],
  "attach": ["DriveFileUrl", ...],
  "logicalTargetId": "..."
}
```

`ALLEGATI.logicalTargetId` è sempre presente. `testMode` è un marker opzionale,
assente per gli invii reali; le preview includono `"testMode":true` e sono escluse
dal duplicate-history lookup.

| Metodo                           | Comportamento                               |
| -------------------------------- | ------------------------------------------- |
| `hasAllegati(): boolean`         | `true` se `docs` o `folders` non sono vuoti |
| `getDocumenti(): DriveFileId[]`  | Array degli ID file collegati nel corpo HTML |
| `getCartelle(): DriveFolderId[]` | Array degli ID cartelle allegate            |

---

### `ProvenienzaDestinazione`

- **Proprietà:** `value: string` — usato in `MOV_ALUNNI.DA` e `MOV_ALUNNI.A`

| Metodo                               | Comportamento                                                          |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `isEsterna(): boolean`               | `true` se `value` non è un `ClasseId` valido (es. nome scuola esterna) |
| `isInterna(): boolean`               | `true` se `value` è un `ClasseId` valido                               |
| `getClasse(): ClasseId \| null`      | ClasseId se interno, altrimenti `null`                                 |
| `getScuolaEsterna(): string \| null` | Nome scuola esterna se esterno, altrimenti `null`                      |

---

### `ValoreCarenza`

- **Proprietà:** `tipo: "VOTO" | "NOTA"`, `valore: number | string`
- **Invariante:** se `tipo = VOTO`, `valore` DEVE essere un numero decimale (es. `4.5`); se `tipo = NOTA`, `valore` DEVE essere una stringa non vuota

| Metodo               | Comportamento                        |
| -------------------- | ------------------------------------ |
| `isVoto(): boolean`  | `true` se `tipo === "VOTO"`          |
| `isNota(): boolean`  | `true` se `tipo === "NOTA"`          |
| `toString(): string` | Rappresentazione testuale del valore |

---

## 4. Value Object JSON complessi

### `ModelliConfig` (da `CONF_DOC.MODELLI`)

Seleziona il template Drive da usare per la generazione. Supporta due forme:

**Forma semplice** — template unico:

```json
{ "templateId": "1abc_drive_file_id" }
```

**Forma condizionale** — selezione runtime:

```json
[
  { "condizione": "{{focus.classe.anagrafica.anno}} == 5", "templateId": "1abc_esame" },
  { "condizione": "true", "templateId": "1abc_default" }
]
```

Per `CONF_DOC.ID=PIANI_PERSONALIZZATI` la forma condizionale è obbligatoria e
contiene esattamente cinque rami, uno per ciascun `TipoPiano`, con condizioni
`{{focus.piano.tipo}} == "<TIPO>"`. Non si usa un ramo generico `true`, perché
un tipo sconosciuto deve produrre un errore esplicito invece di scegliere un
template errato.

| Metodo                               | Comportamento                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `getTemplateId(cdu: CDU): string`    | Valuta le condizioni nell'ordine; restituisce il primo match. Eccezione se nessuna condizione è vera. |
| `hasConditionalTemplates(): boolean` | `true` se è un array condizionale                                                                     |

**Comportamento se `CONF_DOC.MODELLI` è null:** il sistema DEVE restituire un errore esplicito; il campo È OBBLIGATORIO e NON ha default. NON è supportato un ID Drive diretto come stringa: è SEMPRE richiesto il wrapper JSON, in forma semplice o condizionale.

---

### `PermessiConfig` (da `CONF_DOC.PERMESSI`)

```json
{
  "file": [{ "ruolo": "COORDINATORI", "permesso": "SCRITTURA" }],
  "folder": [{ "ruolo": "CDC", "permesso": "LETTURA" }],
  "regolaSupplente": {
    "file": "SOLO_SUPPLENTI",
    "folder": "SOLO_TITOLARI"
  }
}
```

La chiave `regolaSupplente` controlla come le supplenze influenzano l'assegnazione degli accessi Drive, separatamente per file e cartella.

---

### `ImportConfig` (da `CONF_IMP.CONFIG`)

```json
{
  "fileId": "string | null",
  "searchStrategy": "FILE_SINGOLO | CERCA_CARTELLE_CLASSE | CERCA_DOCUMENTI",
  "searchPattern": "string",
  "map": { "[colonnaEsterna]": "[colonnaDB]" },
  "key": ["campoChiave1", "campoChiave2"],
  "conflictResolution": "IGNORE | OVERWRITE | TIMESTAMP",
  "timestampField": "string"
}
```

| Metodo                                    | Comportamento                                |
| ----------------------------------------- | -------------------------------------------- |
| `isAttivo(): boolean`                     | Legge il flag `ATTIVO` del record `CONF_IMP` |
| `getColumnMapping(): Map<string, string>` | Mappa colonna esterna → colonna DB           |

**`conflictResolution: TIMESTAMP`:** il confronto avviene tra `sorgente[timestampField]` e `target[timestampField]` (stessa colonna nel record già presente nel DB target). Se la colonna `timestampField` non esiste nel target, la strategia DEVE comportarsi come `OVERWRITE`.

---

### `BoxConfig` (elemento dell'array `CONF_MAIL.BOX_CFG`)

```json
{
  "TIPO_BOX": "carenze | documenti | documenti_dipartimento | cartelle | note | assenze | cattedre | testo_dinamico | piani_pers_da_inviare | piani_pers_inviati",
  "TITOLO": "string (opzionale; se assente usa il titolo di default del tipo; template Mustache valutato sulla CDU)",
  "ORDINE": 1,
  "ALLEGA": false,
  "PREREQUISITI": "",
  "MOSTRA_SE_VUOTO": false,
  "TESTO_VUOTO": "string (Mustache, valutato sull'intera CDU)",
  "COLORE": "#ddd",
  "DISPLAY_MODE": "nome | link | nome+link | sololink",
  "ARRICCHISCI_CON_STORICO": true,
  "CONFIG_ARRICCHIMENTO": { "TEMPLATE_RIGA": "string Mustache, contesto { corrente, storico }" },
  "CONTENUTO": "string HTML Mustache (solo per testo_dinamico, valutato sull'intera CDU)",
  "DATI_SORGENTE": {
    "metodo": "documentiPerClasse | documentiPerUtente | documentiPerDipartimento | cartellePerClasse | cartellePerUtente | cartellePerDipartimento",
    "filtri": { "tipo": "VERBALE", "not": { "stato": "ARCHIVIATO" } }
  }
}
```

Nota: schema riflette il codice effettivo (`src/application/email/boxes.ts`,
`src/domain/specifications/FiltriSorgente.ts`, `src/application/services/AggregatoreDati.ts`);
fonte di verità del formato filtri: design doc
`docs/superpowers/specs/2026-08-23-filtri-sorgente-unificati-design.md`.

#### Chiavi comuni

| Chiave                 | Descrizione                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `TIPO_BOX`             | Selettore del renderer; valore fuori dall'elenco → box scartato                                                                     |
| `TITOLO`               | Interpolato contro la CDU con `processString` (l'HTML del contenitore fa già l'escape)                                              |
| `ORDINE`               | Ordine di composizione; in assenza si usa l'indice di array                                                                         |
| `ALLEGA`               | Solo `documenti`: autorizza l'invio Gmail dei file della sorgente (`cartelle` + `ALLEGA=true` → warning e allegati statici invariati) |
| `PREREQUISITI`         | Espressione di visibilità per ComposableContentLib; `''` = sempre visibile                                                          |
| `MOSTRA_SE_VUOTO`      | Se true e il box è vuoto, mostra `TESTO_VUOTO`                                                                                      |
| `TESTO_VUOTO`          | Mustache valutato sull'intera CDU                                                                                                   |
| `COLORE`               | Bordo sinistro del contenitore; default `#ddd`                                                                                      |
| `DISPLAY_MODE`          | Solo documenti/cartelle: `nome \| link \| nome+link \| sololink`; fallback a lista semplice                                          |
| `ARRICCHISCI_CON_STORICO` / `CONFIG_ARRICCHIMENTO` | Arricchimento storico per riga, configurabile per i tipi box che lo supportano                          |
| `CONTENUTO`            | Solo `testo_dinamico`                                                                                                               |

#### Invarianti di `piani_pers_da_inviare`

Questo tipo box e' gestito direttamente dal codice: non legge `COLORE`,
`ARRICCHISCI_CON_STORICO` o `CONFIG_ARRICCHIMENTO` da `CONF_MAIL.BOX_CFG`.
Renderizza sempre il link con il testo `{{corrente.studente.nomeCompleto}} -
{{corrente.tipoLabel}}`, usa il bordo sinistro rosso scuro `#C62828` e cerca
sempre nello storico i piani dello stesso studente e sottotipo. Le chiavi di
configurazione restano disponibili per gli altri tipi box.

#### `DATI_SORGENTE` (solo `documenti` e `cartelle`)

Un solo dialetto di filtraggio per link visibili **e** allegati: la stessa config
produce gli stessi insiemi sia che il box mostri link sia che alleghi file.

| Metodo                     | Entità       | Scope di base (prima dei filtri)                                            |
| -------------------------- | ------------ | ---------------------------------------------------------------------------- |
| `documentiPerClasse`       | `LOG_DOCS`   | `findByClasse`, ripetuto su ogni classe di competenza (o `focus.classe`)      |
| `documentiPerUtente`       | `LOG_DOCS`   | `LOG_DOCS.UTENTI` ∋ email utente (`focus.alunno`/`focus.docente`)             |
| `documentiPerDipartimento` | `LOG_DOCS`   | `MATERIE` interseca le materie del dipartimento                               |
| `cartellePerClasse`        | `LOG_FOLD`   | `LOG_FOLD.CLASSI` ∋ classe                                                    |
| `cartellePerUtente`        | `LOG_FOLD`   | `LOG_FOLD.UTENTI` ∋ email utente                                              |
| `cartellePerDipartimento`  | `LOG_FOLD`   | `MATERIE` interseca le materie del dipartimento                               |

- `DATI_SORGENTE` assente → fallback legacy sui dati CDU non filtrati.
- `metodo` mancante/sconosciuto o scope non risolvibile → warning + box saltato.
- I filtri si applicano sempre **dopo** lo scope di base.

#### `filtri` (Filtri Sorgente Unificati)

Chiavi ammesse, camelCase:

| Entità                | Chiavi                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| documenti (`LOG_DOCS`) | `tipo`, `stato`, `sottotipo`, `idGen`, `idOrig`, `notificato`, `classi`, `utenti`, `materie`, `csv`, `not` |
| cartelle (`LOG_FOLD`)  | `idGen`, `tipo`, `nome`, `path`, `classi`, `utenti`, `materie`, `csv`, `not`                                |

Semantica di matching:

- **AND** tra tutti i criteri positivi.
- Campi scalari (`tipo`, `stato`, `sottotipo`, `idGen`, `idOrig`): uguaglianza esatta case-sensitive.
- `notificato`: boolean sulla presenza (`true`) / assenza (`false`) del timestamp `NOTIFICATO`.
- Campi CSV (`classi`, `utenti`, `materie`): stringa singola o array. Con `"csv": "any"` *(default)* basta un
  valore in comune; con `"csv": "all"` tutti i valori del filtro devono essere presenti nell'entità.
- `nome`, `path` (solo cartelle): sottostringa case-sensitive.
- Esclusioni: blocco `not` con la stessa forma dei criteri positivi (senza `not` annidato né `csv` dedicato;
  eredita la modalità globale). L'entità è scartata se almeno una esclusione matcha.
- `filtri` assente o vuoto → nessun filtraggio oltre lo scope.
- `stato` è validato sull'enum `StatoDocumento`; una chiave valida per un'entità usata sull'altra è errore.

Gestione errori (chiave sconosciuta, chiave di altra entità, `stato` fuori enum, tipi errati):

1. `logger.error` con ID pattern `CONF_MAIL` ed elenco chiavi offending;
2. **box saltato** — mai filtro silenziosamente ignorato, mai eccezione che blocca la pipeline.

Chiavi legacy **non ammesse** (rete di sicurezza per config non migrate):

- `FILTRO_TIPO` / `FILTRO_STATO` a livello box → errore + box saltato;
- `filtri` a livello box (fuori da `DATI_SORGENTE`) → errore + box saltato.
