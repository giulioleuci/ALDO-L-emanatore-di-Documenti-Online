# Piano di fix — AUDIT_REAL_DATA.md

Data: 2026-09-05 — branch `master`. Un task = un commit. Ordine = quello sotto
(HIGH prima; il task A chiude due finding).

Gate per ogni task: `npm run typecheck && npm run lint && npm test`.

---

## Task A — punti 1 + 8: normalizzare `asOf` al confine del resolver

**Causa radice unica.** `SUPPLENZE.AL`/`DAL` e `VARIAZIONI_CATTEDRA.DAL` sono
`YYYY-MM-DD` → parsati a mezzanotte UTC. La libreria confronta
`asOf <= validTo` come istanti (`AssignmentCandidate.js:4076`,
`Delegation` idem). Chi passa un `asOf` con l'ora perde l'ultimo giorno; chi
passa mezzanotte no. Oggi convivono entrambe le granularità
(`RisolutoreRuoliService.ts:135` timestamp pieno, `ConsiglioClasseProvider.ts:34`
mezzanotte UTC).

**Fix** (1 punto, non per chiamante): in
`src/infrastructure/role-resolution/AldoTeachingAssignmentResolver.ts:33`,
normalizzare prima di `configuration.resolve(...)`:

```ts
const asOf = new Date(`${data.toISOString().slice(0, 10)}T00:00:00.000Z`);
```

`resolveConsiglio` delega a `resolveMateria`, quindi è coperto. Nessun altro
call site tocca `configuration.resolve`. Nessuna modifica alla libreria: il
`mapping` di `MappedDelegationSource` supporta solo `{from, parse:'csv'}`
(`MappedAssignmentSources.js:26-36`), niente transform — normalizzare l'`asOf`
è comunque il diff più corto e chiude anche il punto 8.

`ConsiglioClasseProvider.ts:34` può restare (idempotente) o semplificarsi a
`new Date(cdu.meta.timestamp)`: la normalizzazione ora è a valle. Preferire la
seconda, così esiste una sola convenzione.

**Ceiling da annotare con commento `ponytail:`**: la data di calendario è
quella UTC. Job eseguiti fra mezzanotte e le 02:00 ora italiana ricadono nel
giorno UTC precedente. Upgrade path: normalizzare su `Europe/Rome` se e quando
si osserva.

**Test**: `test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts`
— caso nuovo: supplenza `DAL=2026-10-01 AL=2026-10-15`, `asOf` =
`2026-10-15T09:30:00Z` → deve restituire il **supplente**. Correggere le
fixture che mascheravano il difetto (`src/onlinetests/data/fixtures.ts:183`,
`...T23:59:59Z` → `2026-10-15`), così i dati di test coincidono con quelli
reali scritti da `SupplenzaRepository.ts:86`.
`test/unit/application/context-engine/consiglio-provider.test.ts` e
`swap-supplenti.test.ts` da rieseguire.

---

## Task B — punto 2: batch email, ripresa per identità logica

**Fix**: in `src/application/services/EmailBatchService.ts`

1. `EmailBatchResumeState` (`:18`) += `processedIds?: string[]`.
2. Dopo `enumerateTargets` (`:309`):

```ts
const doneIds = new Set(resume?.processedIds ?? []);
const targets = this.email.enumerateTargets(config).filter((t) => !doneIds.has(emailTargetId(t)));
```

3. Rimuovere `nextIndex` come punto di ripresa (`:315` → `let i = 0`);
   mantenere il campo nel checkpoint solo se serve alla percentuale, altrimenti
   eliminarlo dal tipo.
4. Ogni push in `processed` (`:375`) affianca
   `processedIds.push(emailTargetId(target))`; `suspendForQuota` e i checkpoint
   persistono il cumulativo.

`emailTargetId` (`src/application/email/saluto.ts:42`) è già l'identità logica
usata dalla deduplica LOG_MAIL e include `carenzaProgressivo` — quindi due
carenze dello stesso studente restano due target distinti (cosa che
`target.target`, già usato in `processed`, non garantisce: per quello serve un
campo nuovo e non il riuso di `processed`).

Aggiornare il docstring `:59` che oggi dichiara l'assunzione ora rimossa.

**Nessun percorso di compatibilità** per stati persistiti prima del deploy: un
resume legacy riparte da 0 e la deduplica LOG_MAIL (`EmailNotificationService.ts:243`)
blocca i reinvii. Va detto nel commit.

**Test**: `test/unit/application/email-batch-service.test.ts` — resume dopo che
un target intermedio è sparito dall'enumerazione: nessun target saltato,
nessun reinvio; e pattern `DUPLICAZIONE=PERMESSA` (set di deduplica vuoto) che
deve comunque non ripetere i target già processati.

---

## Task C — punto 3: `generateClassi` / `generateDipartimenti` congelano i target

**Fix**: allinearsi al pattern già presente negli altri sei assi
(`alunnoTargets`, `DocumentBatchService.ts:886-896`).

- `BatchResumeState` (`:69-76`) += `classeTargets?: string[]`,
  `dipartimentoTargets?: string[]` (ID stringa: `generateForDipartimento` usa
  solo `dipartimento.id`; per le classi si ri-idrata con
  `this.classi.findById(ClasseId.of(id))`).
- `generateDipartimenti` (`:962`) e `generateClassi` (`:1032`): calcolare la
  lista solo quando `resume === null`, altrimenti leggerla dal resume e
  lanciare `ConfigurationError` se assente — identico messaggio/forma di `:891`.
- Classe sparita fra due run: `errori.push` e `continue`, non throw (un ritiro
  di classe non deve uccidere il job).
- I checkpoint yieldati (`:1007`, `:1069 ca.`) devono includere il campo.

**Test**: `test/unit/application/document-batch-service.test.ts` — per entrambi
gli assi: resume con `findAttive()` che restituisce una lista diversa → nessun
salto; resume senza target persistiti → `ConfigurationError`.

---

## Task D — punto 4: rappresentanti dei ritirati

**Fix a causa radice, non al chiamante**: `ClasseRepository.getStudenti`
(`src/infrastructure/repositories/ClasseRepository.ts:231`) ha default
`soloAttivi = false`, cioè il default insicuro. Invertirlo a `true` e
aggiornare `IClasseRepository.ts:44`.

Verifica dei chiamanti (tutti già controllati):

| Call site | Oggi | Dopo |
|---|---|---|
| `ReportService.ts:86,160` | `false` esplicito | invariato |
| `studenti.ts:17,19` | parametro esplicito | invariato |
| `StoricoClasseProvider.ts:48`, `PianiPersClasseProvider.ts:52` | `true` esplicito | invariato |
| `StudentiProvider.ts:40` | default + `.filter(isAttivo)` a valle | invariato di fatto (filtro ridondante, lasciarlo) |
| `RappresentantiProvider.ts:22` | default `false` — **il bug** | corretto |

Diff: due righe, e ogni futuro call site nasce sicuro.

**Test**: `test/unit/application/context-engine/providers/` (o
`classe-repository.test.ts`) — classe con un ritirato rappresentante:
`focus.classe.rappresentanti` non lo elenca. Controllare
`test/unit/infrastructure/classe-cattedre.test.ts` e `piano-repository.test.ts`
per assert che si appoggiavano al vecchio default.

---

## Task E — punto 6: flag di ruolo del destinatario risolti live

**Fix**: `BuildCDUStep.buildDestinatario`
(`src/application/pipelines/emailSteps.ts:208-253`) ha già `this.classi` e
`classiCompetenza`. Risolvere sulle classi di competenza, con la stessa
sorgente usata dalla proiezione CdC (`TeachingCouncilProjection.ts:445-451`):

```ts
const email = docente?.id ?? '';
const inRuolo = (r: 'TUTOR_ASL' | 'TUTOR_ORIENT') =>
  classiEntita.some((c) => this.classi.getDocentiRuoloArticolato(c, r).some((d) => d.id === email));
const isCoordinatore =
  email !== '' && classiEntita.some((c) => this.classi.getCoordinatori(c).some((d) => d.id === email));
```

`ruoliAttivi` / `hasRuoliAttivi`: riusare la funzione `descrizione()` di
`TeachingCouncilProjection.ts:186` esportandola (nessuna nuova logica).

`isCoordinatore` non deve più derivare da `conf.processo`: un target
`PER_COORDINATORE` risulterà comunque `true` perché lo è nei dati.

`classiEntita` = `classiCompetenza.map((id) => this.classi.findById(ClasseId.of(id)))`
filtrando i `null`. Costo: N letture per email, mitigate dalla cache di riga
del repository; se si rivelasse pesante, memoizzare nello Step come già fa
`consiglioCache` (`:165`).

**`isDocenteSostegno` resta `false`** — non esiste alcuna sorgente dati per il
sostegno in tutto `src/` né nello schema; l'unico riferimento è il campo del
CDU (`02_CDU_STRUTTURA.md:740`). Lasciarlo `false` con un commento che dice
perché. **Decisione richiesta** se invece deve essere derivato da qualcosa
(sigla materia? colonna `DOCENTI`?).

**Test**: `test/unit/application/pipelines/email-steps.test.ts` — coordinatore
reale raggiunto da una mail `PER_DOCENTE` → `isCoordinatore: true`;
non-coordinatore raggiunto da `PER_COORDINATORE` (caso CC) → `false`;
tutor ASL → `isTutor` e `isTutorAsl` veri.

---

## Task F — punto 5: appartenenza `UTENTI` stantia

**Il fix richiede una decisione**, perché cambia la semantica documentata di
`documentiPerUtente` / `cartellePerUtente` (14 §2).

- **F1 (raccomandato) — scope live al momento della query.** In
  `AggregatoreDati.getDocumentiPerUtente` (`:64`) e `getCartellePerUtente`
  (`:95`): se la riga ha `CLASSI` valorizzato, la visibilità si decide
  sull'**intersezione con le classi di competenza attuali** dell'utente; solo
  le righe senza `CLASSI` (documenti personali) restano su `containsUtente`.
  Le classi di competenza sono già calcolate a monte
  (`sourceScopeFor`, `emailSteps.ts:122-140`, campo `classiCompetenza`) e
  vanno passate come parametro opzionale ai due metodi e ai wrapper
  `documentiPerUtente` (`:178`) / `cartellePerUtente` (`:215`).
  Chiude entrambe le direzioni: il docente che ha perso la cattedra smette di
  ricevere i link, quello arrivato in corso d'anno inizia a riceverli.
- **F2 — potatura in scrittura.** `AlberoCartelle.upsertLog:76`:
  `mergeCsv` → sostituzione quando `options.utenti` è definito. Diff da una
  riga, ma corregge solo alla **prossima** rigenerazione e non risolve il caso
  del nuovo arrivato. Da solo non basta.

Non fare F2 senza F1; F1 da sola è sufficiente. Se si sceglie F1, il campo
`UTENTI` resta come audit trail — nessuna migrazione dati.

**Fuori scope, da registrare come debito noto**: l'ACL Drive è unidirezionale
allo stesso modo (`ApplyPermissionsStep`, `documentSteps.ts:428` concede e non
revoca mai; solo `POST_PROCESSO.AGGIORNA_PERMESSI_STORICI` rinfresca). La
revoca è una decisione di prodotto, non un bug di consistenza: va chiesta
prima di implementarla.

**Test**: `test/unit/application/aggregatore-dati.test.ts` — docente rimosso
dalla cattedra ma presente in `UTENTI` → box vuoto; docente assente da
`UTENTI` ma con la classe fra le competenze → vede il documento; documento
senza `CLASSI` → continua a seguire `UTENTI`.
`test/unit/infrastructure/albero-cartelle.test.ts` se si adotta anche F2.

---

## Task G — punto 9: carenze di studenti ritirati

**Fix**: `EmailNotificationService.targetsPerCarenza` (`:627`), una riga dopo
il null-check dell'alunno:

```ts
if (!alunno.isAttivo()) continue;
```

Coerente con `PER_ALUNNO` (`:347`) e `PER_GENITORI_ALUNNO` (`:597`), che già
usano `findAttivi()`. Nessun warn: il ritiro non è un'anomalia di dati.

**Test**: `test/unit/application/email-notification-service.test.ts` — carenza
non notificata su studente `ATTIVO=false` → zero target.

---

## Task H — punto 7: solo il primo titolare di un `RUOLI` nel CDU

**Fix**: `SchoolProvider.ts:19` — `ruolo.getEmails()[0]` →
mappare tutte le email. Il campo `persona` è in
`cdu.istituto.staff.elenco[].persona` e nei template, quindi:

- aggiungere `persone: PersonaVM[]` + `hasPersone` accanto a `persona`;
- `persona` resta il primo titolare (compatibilità template, zero rotture);
- aggiornare `SPECS_ALDO/02_CDU_STRUTTURA.md` di conseguenza.

**Valore basso, costo non nullo** (tocca il contratto CDU): se nessun template
elenca più titolari di un ruolo, il fix corretto è **non farlo** e chiudere il
finding come "conosciuto e accettato". **Decisione richiesta** prima di
implementare.

**Test** (se si procede): `test/unit/application/context-engine/builder-istituto.test.ts`
e `cdu-contract.test.ts`.

---

## Decisioni aperte

1. **Task F**: F1 (scope live) come raccomandato, F2, entrambi, o nessuno?
2. **Task E**: `isDocenteSostegno` ha una sorgente dati che non ho trovato?
3. **Task H**: esiste un template che elenca più titolari dello stesso ruolo?
   Se no, si chiude senza fix.
4. **Task A**: la data di calendario resta UTC (accettabile) o serve
   `Europe/Rome`?
