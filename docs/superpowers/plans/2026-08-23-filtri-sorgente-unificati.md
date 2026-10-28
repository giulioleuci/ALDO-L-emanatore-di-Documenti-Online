# Filtri Sorgente Unificati Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere `DATI_SORGENTE.filtri` l'unico filtro validato e semanticamente identico per documenti e cartelle nei box `CONF_MAIL`, nei link visibili e negli allegati.

**Architecture:** Un modulo puro del dominio converte la configurazione JSON in `FiltriSorgente` validati e in `Specification<LogDocumento>` / `Specification<LogCartella>` componibili tramite `DomainRepositoryLib`. `AggregatoreDati` applica tali specification dopo lo scope scelto dall'accessor; rendering e allegati invocano lo stesso parser e il medesimo accesso dati, così un box non può produrre set divergenti tra corpo della mail e file allegati. La composizione resta locale ad ALDO: `DomainRepositoryLib` fornisce già `Specification.and()/not()` e non richiede estensioni.

**Tech Stack:** TypeScript sincrono per Google Apps Script V8, Jest/ts-jest, `DomainRepositoryLib.Specification`, `SheetDBLib` tramite repository ALDO, ESLint e Prettier.

**Spec:** `docs/superpowers/specs/2026-08-23-filtri-sorgente-unificati-design.md`

## Global Constraints

- Il target è Google Apps Script V8: nessuna API Node, browser o asincrona.
- Il dominio non importa servizi GAS, facades o repository infrastrutturali.
- Riutilizzare `DomainRepositoryLib` per composizione delle specification; non duplicarne la logica né modificarne il codice.
- `DATI_SORGENTE.filtri` è il solo dialetto per `documenti` e `cartelle`; `FILTRO_TIPO` e `FILTRO_STATO` devono essere segnalati e mai letti.
- I campi validi sono esattamente quelli del design: documenti `{tipo, stato, sottotipo, idGen, idOrig, notificato, classi, utenti, materie}` e cartelle `{idGen, nome, path, classi, utenti, materie}`.
- I confronti sono case-sensitive e non normalizzano implicitamente; i CSV usano `any` di default o `all`; `not` eredita tale modalità e non può contenere un altro `not`.
- Un filtro/configurazione non valida registra un errore con l'ID `CONF_MAIL` e salta solo quel box/allegato dinamico, senza interrompere gli altri pattern.
- Lo scope base precede sempre il filtro: classe, utente o dipartimento espliciti prevalgono sui valori derivati dal focus CDU; scope irrisolvibile produce warning e box saltato.
- Non modificare `dist/*`; nessuna migrazione automatica dei `BOX_CFG` reali e nessuna modifica a `carenzePerAlunno` / `emailCoordinatori`.

---

## File Structure

| File                                                                              | Responsabilità                                                                                                       |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/domain/specifications/FiltriSorgente.ts`                                     | Tipi del formato, parser/validatore e factory delle specification per documenti e cartelle.                          |
| `src/domain/entities/LogDocumento.ts`                                             | Espone in modo domain-safe `ID_ORIG` e le membership CSV necessarie alle specification.                              |
| `src/domain/entities/LogCartella.ts`                                              | Espone `PATH` e membership CSV UTENTI/MATERIE oltre a CLASSI, senza far filtrare i consumer sui record raw.          |
| `src/application/services/AggregatoreDati.ts`                                     | Applica le specification dopo lo scope e implementa la matrice 3×2 degli accessor.                                   |
| `src/application/email/boxes.ts`                                                  | Converte ciascun box documenti/cartelle nel rispettivo accessor, valida i filtri e rende solo l'insieme filtrato.    |
| `src/application/pipelines/emailSteps.ts`                                         | Risolve gli allegati dinamici attraverso lo stesso accesso/parser del box, preservando deduplica e allegati statici. |
| `test/unit/domain/specifications/filtri-sorgente.test.ts`                         | Contratto di parsing e matching di tutti i filtri.                                                                   |
| `test/unit/domain/log-documento.test.ts`, `test/unit/domain/log-cartella.test.ts` | Contratto degli accessor domain-safe aggiunti.                                                                       |
| `test/unit/application/aggregatore-dati.test.ts`                                  | Scope e filtro per tutti i sei accessor, inclusa la rinomina utente.                                                 |
| `test/unit/application/email-boxes.test.ts`                                       | Rendering, skip di config invalida e migrazione dal dialetto legacy.                                                 |
| `test/unit/application/pipelines/email-steps.test.ts`                             | Allegati filtrati e parità fra IDs visibili/allegati.                                                                |

### Task 1: Esponi i dati di filtro dalle entità senza far trapelare record raw

**Files:**

- Modify: `src/domain/entities/LogDocumento.ts:24-112`
- Modify: `src/domain/entities/LogCartella.ts:21-53`
- Modify: `test/unit/domain/log-documento.test.ts`
- Modify: `test/unit/domain/log-cartella.test.ts`

**Interfaces:**

- Consumes: `COL_LOG_DOCS`, `COL_LOG_FOLD` e il parser CSV già usato dalle due entità.
- Produces: `LogDocumento.getIdOrig(): string`, `LogDocumento.getMaterie(): string[]`, `LogCartella.getPath(): string`, `LogCartella.containsUtente(email: string): boolean`, `LogCartella.containsMateria(materiaId: string): boolean`, `LogCartella.getClassi(): string[]`, `LogCartella.getUtenti(): string[]`, `LogCartella.getMaterie(): string[]`.

- [ ] **Step 1: Scrivi i test fallenti degli accessor di `LogDocumento`**

  In `test/unit/domain/log-documento.test.ts`, crea un `LogDocumento` con `ID_ORIG: 'source-id'`, `CLASSI: '5A,3B'`, `UTENTI: 'a@school.it,b@school.it'` e `MATERIE: 'MATE,FIS'`; verifica che `getIdOrig()` restituisca `'source-id'`, che `getMaterie()` restituisca `['MATE', 'FIS']` e che le membership già esposte restino vere per i valori presenti.

- [ ] **Step 2: Scrivi i test fallenti degli accessor di `LogCartella`**

  In `test/unit/domain/log-cartella.test.ts`, costruisci una cartella con `PATH: 'Archivio/2026/Verbali'`, `CLASSI: '5A,3B'`, `UTENTI: 'a@school.it,b@school.it'`, `MATERIE: 'MATE,FIS'`; verifica `getPath()`, `getClassi()`, `getUtenti()`, `getMaterie()`, `containsUtente('b@school.it')` e `containsMateria('FIS')`, più un valore assente per ciascuna membership.

- [ ] **Step 3: Esegui i test per confermare il fallimento**

  Run: `npx jest --config jest.config.cjs test/unit/domain/log-documento.test.ts test/unit/domain/log-cartella.test.ts --runInBand`

  Expected: FAIL perché i nuovi metodi non esistono.

- [ ] **Step 4: Implementa gli accessor minimi**

  In `LogDocumento`, leggi `COL_LOG_DOCS.ID_ORIG` tramite il record privato già posseduto e riusa il parser CSV locale per `getMaterie()`. In `LogCartella`, aggiungi `getPath()` su `COL_LOG_FOLD.PATH` e riusa lo stesso parser CSV per gli accessor/membership di `CLASSI`, `UTENTI`, `MATERIE`. Non rendere pubblico `raw` e non fare normalizzazione diversa da quella già stabilita dall'entità.

- [ ] **Step 5: Esegui nuovamente i test**

  Run: `npx jest --config jest.config.cjs test/unit/domain/log-documento.test.ts test/unit/domain/log-cartella.test.ts --runInBand`

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add src/domain/entities/LogDocumento.ts src/domain/entities/LogCartella.ts test/unit/domain/log-documento.test.ts test/unit/domain/log-cartella.test.ts
  git commit -m "feat(domain): expose source-filter entity accessors"
  ```

### Task 2: Implementa parser e specification pure di `FiltriSorgente`

**Files:**

- Create: `src/domain/specifications/FiltriSorgente.ts`
- Create: `test/unit/domain/specifications/filtri-sorgente.test.ts`

**Interfaces:**

- Consumes: `LogDocumento`, `LogCartella`, `StatoDocumento`, gli accessor del Task 1 e `Specification<T>` da `src/domain/specifications/Specification.ts`.
- Produces: `type EntitaSorgente = 'documenti' | 'cartelle'`; `type FiltriSorgente`; `parseFiltriSorgente(raw: unknown, entita: EntitaSorgente): { filtri?: FiltriSorgente; errori: string[] }`; `specDocumenti(filtri: FiltriSorgente): Specification<LogDocumento>`; `specCartelle(filtri: FiltriSorgente): Specification<LogCartella>`.

- [ ] **Step 1: Scrivi i test fallenti del parser**

  In `filtri-sorgente.test.ts`, aggiungi tabelle di casi per:

  ```ts
  parseFiltriSorgente(undefined, 'documenti'); // { filtri: undefined, errori: [] }
  parseFiltriSorgente({}, 'documenti'); // idem
  parseFiltriSorgente(
    { tipo: 'VERBALE', csv: 'all', classi: ['5A', '3B'], not: { stato: 'ARCHIVIATO' } },
    'documenti'
  );
  ```

  Verifica inoltre: stringa CSV convertita ad array di un elemento; tutti i campi validi per ciascuna entità; `StatoDocumento` non valido; `csv: 'none'`; booleano `notificato` non booleano; scalare/CSV del tipo sbagliato; chiave ignota; campo documento su cartella e viceversa; e `not.not`. Ogni caso invalido deve restituire `filtri: undefined` e messaggi che nominino le chiavi offending. Le chiavi legacy vivono invece sul box esterno e sono testate nel Task 4.

- [ ] **Step 2: Scrivi i test fallenti di matching**

  Costruisci documenti/cartelle con valori distinti e verifica: uguaglianza esatta per `tipo`, `stato`, `sottotipo`, `idGen`, `idOrig`; `notificato: true` e `false`; CSV `any` e `all`; AND di più criteri; esclusione `not` che prevale; e sottostringa case-sensitive per `nome` / `path`. Verifica anche che `specDocumenti` non accetti una cartella e viceversa attraverso il typecheck del test.

- [ ] **Step 3: Esegui il nuovo test per confermare il fallimento**

  Run: `npx jest --config jest.config.cjs test/unit/domain/specifications/filtri-sorgente.test.ts --runInBand`

  Expected: FAIL con modulo/export mancanti.

- [ ] **Step 4: Implementa tipi, validazione e predicati**

  Implementa un parser totalizzato: solo oggetti plain, `csv` assente o `'any' | 'all'`, scalari stringa, `notificato` booleano, CSV stringa o array non vuoto di stringhe e un singolo `not` object. Mantieni i valori così come forniti (nessun trim/case-fold).

  Implementa piccole `Specification<T>` locali (o una factory privata di predicate specification) con `toQueryObject(): null`; componi i criteri positivi con `.and()` e applica la specification di `not` come negazione del risultato. Per i CSV usa `filter.some(candidateContains)` in modalità `any` e `filter.every(candidateContains)` in modalità `all`. La factory non deve interrogare database né importare infrastruttura/GAS.

- [ ] **Step 5: Esegui il test del modulo**

  Run: `npx jest --config jest.config.cjs test/unit/domain/specifications/filtri-sorgente.test.ts --runInBand`

  Expected: PASS.

- [ ] **Step 6: Esegui typecheck del confine domain**

  Run: `npm run typecheck`

  Expected: PASS senza import applicativi/infrastrutturali nel nuovo file.

- [ ] **Step 7: Commit**

  ```bash
  git add src/domain/specifications/FiltriSorgente.ts test/unit/domain/specifications/filtri-sorgente.test.ts
  git commit -m "feat(domain): add unified source filters"
  ```

### Task 3: Completa la matrice `AggregatoreDati` e applica le specification dopo lo scope

**Files:**

- Modify: `src/application/services/AggregatoreDati.ts:30-138`
- Modify: `test/unit/application/aggregatore-dati.test.ts:1-220`

**Interfaces:**

- Consumes: `parseFiltriSorgente`, `specDocumenti`, `specCartelle`, `DipartimentoRepository`, `MateriaRepository`, `MateriePerDipartimentoSpec`, `DocumentoItem`-independent domain entities.
- Produces: `getDocumentiPerUtente(utenteEmail: string, filtri?: FiltriSorgente): LogDocumento[]`; `getDocumentiPerDipartimento(dipartimentoId: string, filtri?: FiltriSorgente): LogDocumento[]`; `getCartellePerClasse(classeId: string, filtri?: FiltriSorgente): LogCartella[]`; `getCartellePerUtente(utenteEmail: string, filtri?: FiltriSorgente): LogCartella[]`; `getCartellePerDipartimento(dipartimentoId: string, filtri?: FiltriSorgente): LogCartella[]`; `perMetodo(metodo, { utenteEmail?, classeId?, dipartimentoId?, filtri?: unknown }, logger?)`.

- [ ] **Step 1: Riscrivi i test dell'accessor utente**

  Sostituisci le aspettative di `getDocumentiPerAlunno`/`documentiPerAlunno` con `getDocumentiPerUtente`/`documentiPerUtente`. Mantieni il caso di scope `UTENTI` e aggiungi `filtri: { tipo, sottotipo, classi }` che lasci un solo ID, dimostrando che lo scope utente viene eseguito prima della specification.

- [ ] **Step 2: Aggiungi casi fallenti per le cinque combinazioni restanti**

  Nel fixture locale crea documenti e cartelle che differiscono in `CLASSI`, `UTENTI`, `MATERIE`, `TIPO` e `PATH`. Testa:

  ```ts
  agg.perMetodo(
    'documentiPerClasse',
    { classeId: '5A', filtri: { not: { tipo: 'CONDOTTA' } } },
    logger
  );
  agg.perMetodo(
    'documentiPerDipartimento',
    { dipartimentoId: 'DIP_SCI', filtri: { materie: 'MATE' } },
    logger
  );
  agg.perMetodo('cartellePerClasse', { classeId: '5A', filtri: { path: 'Archivio' } }, logger);
  agg.perMetodo(
    'cartellePerUtente',
    { utenteEmail: 'a@school.it', filtri: { nome: 'Verbali' } },
    logger
  );
  agg.perMetodo(
    'cartellePerDipartimento',
    { dipartimentoId: 'DIP_SCI', filtri: { idGen: 'VERBALI' } },
    logger
  );
  ```

  Per i dipartimenti, prepara `DIPART.MATERIE` e `MATERIE` coerenti e verifica che l'insieme materie provenga da `MateriePerDipartimentoSpec`. Aggiungi un caso con scope mancante: ritorna `null` e registra un warning che contiene metodo e motivo.

- [ ] **Step 3: Esegui il test per confermare il fallimento**

  Run: `npx jest --config jest.config.cjs test/unit/application/aggregatore-dati.test.ts --runInBand`

  Expected: FAIL per nomi nuovi, metodi mancanti e risultati non filtrati.

- [ ] **Step 4: Implementa scope e filtro**

  Istanzia nel costruttore i repository `DipartimentoRepository` e `MateriaRepository` già infrastrutturali, come avviene per gli altri repository di `AggregatoreDati`. Mantieni le cache `allDocumenti` e `allCartelle`.

  Per classe, conserva `logDocs.findByClasse` e la regola delle classi partner esistente; per utente filtra `containsUtente`; per dipartimento risolvi il dipartimento, seleziona le materie con `new MateriePerDipartimentoSpec(dipartimento)` e conserva le entità la cui membership MATERIE interseca quelle sigle. Solo dopo queste operazioni valuta `specDocumenti(filtri).isSatisfiedBy(...)` o `specCartelle(...)`. Elimina `DocumentoFiltri`, `matchesDoc`, `getDocumentiPerAlunno` e il routing legacy.

  Fai sì che `perMetodo` validi `params.filtri` con `parseFiltriSorgente` conoscendo l'entità del metodo; in caso di errori o scope non risolvibile, emetta un warning e ritorni `null`, non un array vuoto indistinguibile da un match legittimo.

- [ ] **Step 5: Esegui il test dell'aggregatore**

  Run: `npx jest --config jest.config.cjs test/unit/application/aggregatore-dati.test.ts --runInBand`

  Expected: PASS, inclusi i test preesistenti su classi partner, cache, carenze e coordinatori.

- [ ] **Step 6: Commit**

  ```bash
  git add src/application/services/AggregatoreDati.ts test/unit/application/aggregatore-dati.test.ts
  git commit -m "feat(email): unify filtered data-source accessors"
  ```

### Task 4: Fai convergere il rendering di documenti e cartelle sul filtro validato

**Files:**

- Modify: `src/application/email/boxes.ts:459-691`
- Modify: `src/application/pipelines/emailSteps.ts:400-467`
- Modify: `test/unit/application/email-boxes.test.ts:861-952`
- Modify: `test/unit/application/pipelines/email-steps.test.ts` (test di `RenderBoxesStep`)

**Interfaces:**

- Consumes: `AggregatoreDati.perMetodo`, `parseFiltriSorgente`, `LogDocumento`, `LogCartella`, `Cdu` e `LoggerService`.
- Produces: `renderBoxes(..., aggregatoreDati?, sourceScope?, logger?)` che restituisce `documentIds` e `folderIds` univoci esclusivamente dagli elementi resi; `RenderBoxesStep` calcola e passa `{ utenteEmail?, classeId?, dipartimentoId? }` dal focus CDU e dalle classi di competenza.

- [ ] **Step 1: Scrivi test fallenti del nuovo dialetto per link documenti**

  In `email-boxes.test.ts`, sostituisci i test basati su `FILTRO_TIPO`/`FILTRO_STATO` con un box:

  ```ts
  {
    TIPO_BOX: 'documenti',
    DATI_SORGENTE: { metodo: 'documentiPerClasse', filtri: { tipo: 'VERBALE', sottotipo: 'CDC', not: { stato: 'ARCHIVIATO' } } }
  }
  ```

  Inserisci tre `LOG_DOCS` nel fake DB e verifica che HTML e `documentIds` contengano unicamente il documento ammesso. Aggiungi il caso senza `filtri`, che conserva tutti gli elementi nello scope, e verifica che una coppia `FILTRO_TIPO`/`FILTRO_STATO` causi box invisibile, nessun ID e una chiamata `logger.error` con `P1` e le chiavi legacy.

- [ ] **Step 2: Scrivi test fallenti di cartelle e scope derivato**

  Aggiungi box `cartelle` configurati rispettivamente con `cartellePerClasse`, `cartellePerUtente` e `cartellePerDipartimento`; verifica filtri `nome`, `path`, CSV `materie` e `not`. Passa un CDU con focus alunno/docente/dipartimento ed espliciti scope arguments quando necessari; verifica che i `folderIds` siano de-duplicati dopo l'unione delle classi di competenza. Aggiungi un box con chiave documento (`sottotipo`) su cartella: è saltato, altri box restano renderizzati.

- [ ] **Step 3: Esegui i test per confermare il fallimento**

  Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts test/unit/application/pipelines/email-steps.test.ts --runInBand`

  Expected: FAIL perché `renderBoxes` legge ancora `FILTRO_*`, le cartelle non ricevono filtri e non esiste scope completo.

- [ ] **Step 4: Implementa la risoluzione condivisa del box**

  Rimuovi `documentiFiltro`, tutta la lettura `FILTRO_TIPO/FILTRO_STATO` e il filtro inline di `aggregaDati`. Per ogni box `documenti`/`cartelle`, estrai `DATI_SORGENTE` e:

  1. valida `filtri` con l'entità corrispondente;
  2. se invalido, `logger.error('CONF_MAIL <id> ...')` e non includere quel blocco nella recipe;
  3. invoca `aggregatoreDati.perMetodo(metodo, scope + filtri, logger)` per ottenere le entità già scoping-ridotte e filtrate;
  4. proietta l'entità in item di box, conservando i campi necessari a template e logging;
  5. de-duplica per ID come il comportamento corrente sulle cartelle.

  Mantieni il fallback CDU esclusivamente per box senza `DATI_SORGENTE` e senza `filtri`, quindi non introduci una regressione sui `BOX_CFG` non coinvolti; se `filtri` esiste ma il metodo non è utilizzabile, tratta il box come configurazione non risolvibile (warning + skip), mai come filtro silenziosamente ignorato. Passa a `renderBoxes` lo scope dal `RenderBoxesStep`: classi di competenza esplicite se presenti, altrimenti `focus.classe`; email di `focus.alunno`/`focus.docente`; ID di `focus.dipartimento`.

- [ ] **Step 5: Esegui i test dei box e della pipeline**

  Run: `npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts test/unit/application/pipelines/email-steps.test.ts --runInBand`

  Expected: PASS, compresi i test non correlati di composizione/condizioni.

- [ ] **Step 6: Commit**

  ```bash
  git add src/application/email/boxes.ts src/application/pipelines/emailSteps.ts test/unit/application/email-boxes.test.ts test/unit/application/pipelines/email-steps.test.ts
  git commit -m "feat(email): render boxes through unified source filters"
  ```

### Task 5: Usa lo stesso percorso per gli allegati e verifica la parità end-to-end di unità

**Files:**

- Modify: `src/application/pipelines/emailSteps.ts:488-536`
- Modify: `src/application/services/EmailNotificationService.ts:304-335`
- Modify: `src/config/ApplicationComposition.ts` (solo se la dipendenza `aggregatoreDati` non è già inoltrata)
- Modify: `test/unit/application/pipelines/email-steps.test.ts:2116-2141`

**Interfaces:**

- Consumes: il `AggregatoreDati` del Task 3, il calcolo scope del Task 4 e `parseFiltriSorgente`.
- Produces: `ComposeEmailStep` riceve opzionalmente/esplicitamente `AggregatoreDati` e `resolveAllegati` aggiunge solo i `LogDocumento` prodotti dallo stesso metodo/filtri del box `ALLEGA=true`; gli allegati statici e la deduplica rimangono invariati.

- [ ] **Step 1: Scrivi il test fallente di parità link/allegati**

  In `email-steps.test.ts`, configura un singolo box `documenti` con `ALLEGA: true`, `metodo: 'documentiPerClasse'` e filtri che combinano `sottotipo`, `classi`, `notificato` e `not`. Inserisci documenti candidati che falliscono uno solo dei criteri. Esegui `RenderBoxesStep` e `ComposeEmailStep`; verifica:

  ```ts
  expect(ctx.get('documentIds')).toEqual(['doc-ok']);
  expect(ctx.get('allegatiIds')).toEqual(['doc-ok']);
  expect(ctx.get('allegati')).toEqual(['blob:doc-ok']);
  ```

  Aggiungi un secondo test con filtro invalido (`stato: 'BOGUS'`): il renderer logga/salta il box, il compose non aggiunge documenti dinamici e gli eventuali ID in `CONF_MAIL.ALLEGATI` restano presenti.

- [ ] **Step 2: Esegui il test per confermare il fallimento**

  Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "attachments|parity|invalid" --runInBand`

  Expected: FAIL perché `resolveAllegati` ha il proprio filtro inline limitato a tipo/stato.

- [ ] **Step 3: Implementa la risoluzione comune**

  Inoltra `d.aggregatoreDati` da `EmailNotificationService.buildPipeline` al costruttore di `ComposeEmailStep` e adatta i factory/test helper che lo costruiscono. In `resolveAllegati`, trova tutti i box `ALLEGA: true` con sorgente `documenti*`, valida `DATI_SORGENTE.filtri` come documenti e richiama l'aggregatore con il medesimo scope determinato dal CDU. Non allegare cartelle (una cartella Drive non è un blob); se `ALLEGA` è impostato su un box cartelle, registra warning e non modifica gli allegati statici. Conserva la deduplica globale ID e il recupero blob dopo la deduplica.

- [ ] **Step 4: Esegui i test mirati**

  Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts --runInBand`

  Expected: PASS, inclusi allegati statici, ID mancanti e deduplica esistenti.

- [ ] **Step 5: Esegui la verifica completa**

  Run: `npm test && npm run typecheck && npm run lint`

  Expected: tutti i test unitari, TypeScript ed ESLint completano con exit code 0. Prima di chiudere, esegui `rg -n "FILTRO_TIPO|FILTRO_STATO|documentiPerAlunno" src test` e lascia occorrenze solo nelle asserzioni di validazione legacy/documentazione intenzionali.

- [ ] **Step 6: Commit**

  ```bash
  git add src/application/pipelines/emailSteps.ts src/application/services/EmailNotificationService.ts src/config/ApplicationComposition.ts test/unit/application/pipelines/email-steps.test.ts
  git commit -m "feat(email): align filtered attachments with rendered links"
  ```

## Plan Self-Review

- **Copertura della spec:** Task 1 rende disponibili tutti i campi fisici senza raw leakage; Task 2 copre parser, enum, `any`/`all`, `not`, errori e semantica; Task 3 completa la matrice accessori e conserva gli invariati; Task 4 elimina il dialetto legacy e filtra rendering documenti/cartelle; Task 5 rende gli allegati coerenti, mantiene il comportamento best-effort e chiude con le verifiche richieste.
- **Nessun placeholder:** ogni task elenca file, interfacce, casi di test, comando atteso e commit.
- **Coerenza dei tipi:** il parser produce `FiltriSorgente`; entrambi i consumer passano tale valore a `AggregatoreDati`; solo la specification di entità corrispondente è valutata. I campi scope hanno i nomi `utenteEmail`, `classeId`, `dipartimentoId` in tutti i task.
