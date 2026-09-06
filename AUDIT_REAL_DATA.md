# Audit: ricostruzione real-time dei dati mutabili durante l'anno

Data: 2026-09-05 — branch `master`

Nota preliminare sullo scope: **non esiste una tabella `UTENTI`**. `UTENTI` è una
colonna CSV di `LOG_DOCS` e `LOG_FOLD` (`src/config/schema.ts:223,237`), scritta al
momento della generazione. La domanda 9 diventa quindi: "quel CSV registrato viene
usato per scegliere i destinatari?" — risposta nel finding 5.

Baseline verificata pulita: nessun repository passa una cache a
`DomainRepositoryLib.Repository` (tutti `super(database, TABLE.X, Entity)`, 3 argomenti
→ `cache = null`, `Repository.js:31`), quindi nessuna staleness da `CacheService` tra
esecuzioni. `initAldo(now = new Date())` (`Bootstrap.ts:516`) ricostruisce container e
clock a ogni esecuzione, trigger di resume inclusi.

---

## 1. `SUPPLENZE.AL` — ultimo giorno di supplenza escluso silenziosamente — **HIGH — FIXED (task 1)**

- `AldoTeachingResolutionConfig.ts:205` mappa `validTo ← COL_SUPPLENZE.AL`.
- La libreria confronta `asOf <= this.validTo` come istanti
  (`RoleResolutionLib/src/core/AssignmentCandidate.js:58`). `AL` viene parsato a
  **mezzanotte**.
- `asOf` è un timestamp completo: `RisolutoreRuoliService.ts:135`
  (`new Date(cdu.meta.timestamp)`), `EmailNotificationService.ts:440`,
  `DocumentBatchService.ts:472/585/688/787`.

Effetto: qualsiasi generazione/invio dopo le 00:00 del giorno `AL` risolve di nuovo sul
**titolare**, con un giorno di anticipo. Il difetto è mascherato nei test perché le
fixture codificano il fine giornata (`src/onlinetests/data/fixtures.ts:183` →
`2026-10-15T23:59:59Z`). I dati reali scritti da `creaSupplenza` sono `YYYY-MM-DD`
(`SupplenzaRepository.ts:86`).

Fix: normalizzare `AL` a fine giornata nella mappatura (un solo punto), non per singolo
chiamante.

## 2. Batch email: target ri-enumerati al resume, ripresa per indice — **HIGH — FIXED (task 2)**

`EmailBatchService.ts:309` ri-esegue `enumerateTargets` a ogni run; `:315` riprende da
`resume.nextIndex`; `:325` cicla. Il docstring a `:59` dichiara l'assunzione
("enumeration must be stable across runs") — che per costruzione non regge: nuove
iscrizioni, ritiri (`ATTIVO=false` rimuove un target in mezzo alla lista) e variazioni
di organico spostano gli indici. Una sospensione per quota (`:327`) può fermare il job
per **oltre 24h**.

Effetto: un ritiro sposta a sinistra di uno tutto ciò che segue → esattamente un target
saltato in modo permanente per ogni shift. I re-invii sono già bloccati dal
`logicalTargetId` letto da `LOG_MAIL` (`EmailNotificationService.ts:243-264`), quindi il
fix pigro è riprendere dal set `processed` invece che da `nextIndex`: l'indice non
aggiunge nulla che la deduplica non copra già.

## 3. Due assi documentali ricalcolano la lista target a ogni resume — **HIGH — FIXED (task 3)**

Ogni asse persiste lo snapshot dei target nel checkpoint (`planTargets`,
`docenteClasseMateriaTargets`, `classeMateriaTargets`, `classeDocenteTargets`,
`docenteTargets`, `alunnoTargets`) **tranne**:

- `DocumentBatchService.ts:1032-1046` (`generateClassi`) — ricalcola `findAttive()` a
  ogni run, riprende da `resume.nextIndex`.
- `DocumentBatchService.ts:962-973` (`generateDipartimenti`) — idem.

Stesso rischio di salto/duplicazione del punto 2, e incoerente con gli altri sei assi
dello stesso file.

## 4. I rappresentanti includono studenti ritirati — **MEDIUM — FIXED (task 5)**

`RappresentantiProvider.ts:22`: `this.classi.getStudenti(sorgente)` — `soloAttivi` vale
`false` per default (`ClasseRepository.ts:231`). Tutti i call site fratelli filtrano:
`StudentiProvider.ts:41`, `RisolutoreRuoliService.ts:320,326`,
`PianiPersClasseProvider.ts:52`, `StatisticheProvider.ts:36`. Solo `ReportService.ts:86,160`
passa `false` deliberatamente.

Effetto: `focus.classe.rappresentanti` elenca studenti ritirati e i relativi
rappresentanti dei genitori; `focus.classe.studenti.perStato.rappresentanti` (filtrato)
lo contraddice all'interno dello stesso CDU. La risoluzione dei destinatari
(`RAPPRESENTANTI_STUDENTI`) è corretta — questo riguarda solo la visualizzazione, ma
finisce nei verbali.

## 5. `LOG_FOLD`/`LOG_DOCS.UTENTI`: lista di appartenenza stantia e append-only usata per decidere cosa riceve un utente — **MEDIUM — FIXED (task 7)**

- `AlberoCartelle.ts:76`: `mergeCsv(current?.UTENTI, options.utenti)` — solo unione,
  **mai potatura**.
- `AggregatoreDati.ts:64` (`getDocumentiPerUtente`) e `:95` (`getCartellePerUtente`)
  selezionano le righe con `containsUtente(...)` su quel CSV registrato; ci si arriva
  dal rendering dei box tramite `sourceScopeFor` (`emailSteps.ts:131`).

Effetto: un docente che ha perso la cattedra (variazione / fine supplenza) continua a
ricevere quei link a cartelle e documenti a tempo indeterminato; un docente arrivato in
corso d'anno non matcha nulla e vede un box vuoto. Regola di divergenza attuale: per
`*PerUtente` vince il log sui dati operativi; per `*PerClasse` (`AggregatoreDati.ts:72`)
l'entità classe è risolta live ed è corretta.

Da notare che l'ACL Drive ha la stessa proprietà unidirezionale: `ApplyPermissionsStep`
(`documentSteps.ts:428`) concede ruoli risolti live ma non revoca mai. Solo
`POST_PROCESSO.AGGIORNA_PERMESSI_STORICI` (`documentSteps.ts:575`) rinfresca i permessi
sul pregresso, e solo dove è configurato.

**Debito noto, non risolto qui:** la revoca ACL è fuori scope di questo piano — è una
decisione di prodotto (chi deve perdere l'accesso e quando), da chiedere a parte.

## 6. I flag di ruolo del destinatario sono costanti hardcoded — **MEDIUM — FIXED (task 6)**

`emailSteps.ts:235-241`:

```ts
ruoliAttivi: [], hasRuoliAttivi: false,
isCoordinatore: conf.processo === ProcessoInvio.PER_COORDINATORE,
isTutor: false, isTutorAsl: false, isDocenteSostegno: false,
```

Mai risolti da `CLASSI.COORD` / `CLASSI.RUOLI`, al contrario dei flag per membro del CdC
che invece **sono** risolti live (`TeachingCouncilProjection.ts:467-497`).
`isCoordinatore` deriva dal processo di invio, non da chi è coordinatore oggi: una mail
`PER_DOCENTE` a un coordinatore reale riporta `false`. Non è un dato stantio, è un dato
inventato.

## 7. Solo il primo titolare di un ruolo `RUOLI` arriva nel CDU — **LOW — FIXED (task 8)**

`SchoolProvider.ts:19`: `ruolo.getEmails()[0]`. `RuoloSpeciale` modella esplicitamente
"one or more teachers" (`RuoloSpeciale.ts:13`) e `RisolutoreRuoliService.referente`
(`:331-334`) li restituisce **tutti**. Quindi `cdu.istituto.staff` mostra un solo
titolare mentre l'ACL per lo stesso ruolo li abilita tutti.

## 8. Due granularità diverse di `asOf` per la stessa risoluzione — **LOW — FIXED (task 1)**

`ConsiglioClasseProvider.ts:34` costruisce `asOf` come mezzanotte UTC del giorno;
`RisolutoreRuoliService.ts:135` usa il timestamp completo. Nei casi di confine sulla
stessa giornata il consiglio nel CDU e i destinatari email/ACL possono divergere. Da
risolvere insieme al punto 1: scegliere una normalizzazione e applicarla al confine del
resolver.

## 9. Le email carenza non filtrano lo stato dello studente — **LOW — FIXED (task 4)**

`EmailNotificationService.ts:627-645`: `targetsPerCarenza` itera
`carenze.findNonNotificate()` e risolve lo studente senza alcun controllo `isAttivo()`,
a differenza di `PER_ALUNNO` (`:347`) e `PER_GENITORI_ALUNNO` (`:597`). Uno studente
ritirato con una carenza aperta fa comunque partire la mail alla famiglia.

---

## Reliable as is

| Area | Evidenza |
|---|---|
| CDU costruito ex novo per ogni target; i provider interrogano i repository live | `ContextBuilder.build` (`:61`) costruisce un CDU nuovo a ogni chiamata; nessun provider legge un contesto serializzato |
| Nessuna cache di righe tra esecuzioni | ogni repo `super(database, TABLE, Entity)`; `Repository.js:31` `cache = null` |
| Coordinatori risolti al momento della generazione | `ClasseRepository.getCoordinatori:184` → `rowOf:492` → `getByPK` a ogni chiamata; consumato live in `EmailNotificationService.ts:462`, `RisolutoreRuoliService.ts:152`, `ClasseProvider.ts:93` |
| Titolare di `RUOLI` risolto al momento della generazione, non da associazione memorizzata | `RisolutoreRuoliService.referente:332` → `ruoli.findById` a ogni risoluzione |
| Ruoli di classe (`SEGRETARIO`, `TUTOR_ASL`, `TUTOR_ORIENT`) live da `CLASSI.RUOLI` | `ClasseRepository.getDocentiRuolo:188`, `TutorProvider.ts:36` |
| Catena di priorità SUPPLENZE → VARIAZIONI_CATTEDRA → CLASSI con filtro data | `AldoTeachingResolutionConfig.create:181-266` (delegationSource / overrideSource / assignmentSource), data propagata a `resolve(asOfDate)` — corretta a parte il punto 1 |
| `LOG_DOCS` mai usato per ricostruire dati di contesto | `CheckDuplicatesStep` (`documentSteps.ts:247`) lo legge solo per la deduplica; `RegisterDocumentStep` (`:507`) è write-only; `DocumentiProvider`/`DocumentiClasseProvider` lo leggono come inventario documenti, che è il suo scopo |
| Le strategie di generazione ricevono solo il CDU fresco | tutti i costruttori prendono `ITemplateEngine` (+ `IMateriaRepository`, catalogo stabile) — `src/application/strategies/*.ts` |
| Appartenenza dello studente alla classe in tempo reale | `AlunnoRepository.findByClasse:40` sulle righe `ALUNNI` live; nessun replay di `MOV_ALUNNI` necessario |
| Gli import non lasciano finestre di incoerenza | import e generazione sono entrypoint di menu separati (`EntryPoints_Menu.ts:44,68`) → esecuzioni separate; l'esecuzione successiva ricostruisce il container e rilegge il foglio |
| Il clock iniettato avanza al resume | `initAldo(now = new Date())` per esecuzione (`Bootstrap.ts:516`); solo la *lista* dei target è congelata, mai la data |

Snapshot per-esecuzione che **non** sono difetti: `AldoTeachingResolutionConfig` carica
`SUPPLENZE`/`VARIAZIONI`/`DOCENTI` una volta nel costruttore (`:141-179`),
`AggregatoreDati` mette in cache intere tabelle di log (`:299-310`),
`BuildCDUStep.consiglioCache` (`emailSteps.ts:165`). Muoiono tutti con l'esecuzione.
Un solo caveat marginale: se `resumeJob` dovesse mai eseguire un job di import e uno di
generazione nello stesso container, lo snapshot del resolver precederebbe l'import —
probabilità bassa, non vale una guardia finché non si osserva.

---

Ordine di priorità per il fix: **1** (docente sbagliato in silenzio, a ogni supplenza),
**2/3** (destinatari saltati in silenzio), poi **5**, **6**, **4**.
