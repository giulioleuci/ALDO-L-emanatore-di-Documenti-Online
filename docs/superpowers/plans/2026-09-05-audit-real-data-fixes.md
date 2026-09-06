# AUDIT_REAL_DATA — Piano di implementazione dei 9 fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** eliminare le nove incoerenze fra dati mutabili durante l'anno scolastico e contesto generato/inviato, elencate in `AUDIT_REAL_DATA.md`.

**Architecture:** ogni fix agisce nel punto unico dove il difetto entra nel sistema, mai sui chiamanti: la data di risoluzione si normalizza al confine del resolver, la ripresa dei batch passa dall'indice posizionale all'identità logica del target, l'appartenenza a una classe si risolve live invece di leggerla da un CSV registrato in passato. Nessuna modifica a `GasLibraryFactory`: i punti di innesto ALDO-side esistono già.

**Tech Stack:** TypeScript (transpilato a GAS V8), Jest + ts-jest, `FakeDatabase` + `test/fixtures/tables.ts` come doppio dei fogli, `RoleResolutionLib`/`JobRunnerLib` via facade ALDO.

**Spec:** `AUDIT_REAL_DATA.md` (findings 1-9, con file e riga di ogni difetto)

## Global Constraints

- **Target GAS V8, solo codice sincrono.** Niente `async`/`await`, niente API Node o browser.
- **Nessun global GAS nativo** (`SpreadsheetApp`, `DriveApp`, `MailApp`, `Utilities`, ...) fuori da `GoogleApiWrapper`: ESLint fa fallire `npm run lint`.
- **Mai modificare `dist/*`** né `vendor/gaslibs.Code.js`: sono generati.
- **GasLibraryFactory-first**: nessun task qui richiede logica nuova che la libreria già offre; se durante l'esecuzione emerge il contrario, fermarsi e chiedere invece di scrivere codice ALDO-local.
- **Nomi di tabelle e colonne sempre MAIUSCOLI**, come da `SPECS_ALDO/01_SCHEMA_DATABASE.md`.
- **Gate per ogni task, prima del commit:** `npm run typecheck && npm run lint && npm test`.
- Un task = un commit. I task sono indipendenti fra loro e possono essere eseguiti nell'ordine dato.
- Prosa e commenti in italiano come il resto del repo; i nomi dei test in inglese, come i test esistenti.

---

## File Structure

**Modificati (produzione):**

| File | Responsabilità dopo il cambio | Task |
|---|---|---|
| `src/infrastructure/role-resolution/AldoTeachingAssignmentResolver.ts` | unico confine verso `RoleResolutionLib`; normalizza `asOf` a giorno di calendario | 1 |
| `src/application/context-engine/providers/ConsiglioClasseProvider.ts` | smette di normalizzare per conto proprio | 1 |
| `src/onlinetests/data/fixtures.ts` | date di supplenza nella forma reale (`YYYY-MM-DD`) | 1 |
| `src/application/services/EmailBatchService.ts` | ripresa batch per identità logica del target, non per indice | 2 |
| `src/application/services/DocumentBatchService.ts` | snapshot dei target anche per gli assi CLASSE e DIPARTIMENTO | 3 |
| `src/application/services/EmailNotificationService.ts` | enumerazione carenze limitata agli studenti attivi | 4 |
| `src/infrastructure/repositories/ClasseRepository.ts`, `src/domain/repositories/IClasseRepository.ts` | `getStudenti` con default sicuro (solo attivi) | 5 |
| `src/application/context-engine/TeachingCouncilProjection.ts` | esporta `descrizione()` per riuso | 6 |
| `src/application/pipelines/emailSteps.ts` | flag di ruolo del destinatario risolti live | 6 |
| `src/config/schema.ts` | costante `MATERIA_SOSTEGNO` | 6 |
| `src/application/services/AggregatoreDati.ts` | visibilità documenti/cartelle per utente risolta live | 7 |
| `src/application/email/boxes.ts` | propaga le classi di competenza al metodo `*PerUtente` | 7 |
| `src/application/context-engine/providers/SchoolProvider.ts`, `src/application/context-engine/Cdu.ts` | `staff` espone tutti i titolari di un ruolo | 8 |
| `SPECS_ALDO/02_CDU_STRUTTURA.md` | contratto `RuoloStaffVM` aggiornato | 8 |

**Modificati (test):** `test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts`, `test/unit/application/email-batch-service.test.ts`, `test/unit/application/document-batch-service.test.ts`, `test/unit/application/email-notification-service.test.ts`, `test/unit/application/context-engine/classe-provider.test.ts`, `test/unit/application/pipelines/email-steps.test.ts`, `test/unit/application/aggregatore-dati.test.ts`, `test/unit/application/context-engine/providers/school-provider.test.ts`.

**Nessun file nuovo.** Ogni fix vive nel modulo che già possiede quella responsabilità.

---

## Decisioni già prese (non riaprire)

- **Punto 5**: si adotta lo **scope live alla query** (F1). `UTENTI` resta come audit trail e non viene potato in scrittura.
- **Punto 6**: `isDocenteSostegno` si deriva da una **riga MATERIE dedicata**. Il piano usa la costante `MATERIA_SOSTEGNO = 'SOS'`. **Prima di eseguire il Task 6, confermare l'ID reale della riga MATERIE** e sostituirlo nella costante: nel repo non esiste ancora alcuna riga di sostegno (zero occorrenze in schema, fixture e dati onlinetests).
- **Punto 7**: si fa il fix, aggiungendo `persone[]` accanto a `persona` (che resta il primo titolare, per non rompere i template).
- **Fuori scope, debito noto da non implementare qui**: l'ACL Drive è unidirezionale (`ApplyPermissionsStep`, `src/application/pipelines/documentSteps.ts:428` concede e non revoca mai). La revoca è una decisione di prodotto, va chiesta a parte.

---

## Task 1: `asOf` normalizzato al confine del resolver (audit §1 + §8)

`SUPPLENZE.DAL`/`AL` e `VARIAZIONI_CATTEDRA.DAL` sono date di calendario `YYYY-MM-DD` che `RoleResolutionLib` parsa a mezzanotte UTC e confronta come istanti (`asOf <= validTo`). Chi passa un `asOf` con l'ora perde l'ultimo giorno della supplenza; oggi convivono due granularità (`RisolutoreRuoliService.ts:135` timestamp pieno, `ConsiglioClasseProvider.ts:34` mezzanotte). Un solo punto di normalizzazione chiude entrambi i finding.

**Files:**
- Modify: `src/infrastructure/role-resolution/AldoTeachingAssignmentResolver.ts:24-44`
- Modify: `src/application/context-engine/providers/ConsiglioClasseProvider.ts:34`
- Modify: `src/onlinetests/data/fixtures.ts:183`
- Test: `test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts`

**Interfaces:**
- Consumes: niente da task precedenti.
- Produces: `AldoTeachingAssignmentResolver.resolveMateria(classe, materia, data, routingPolicy?)` e `resolveConsiglio(classe, data, options?)` mantengono la firma; cambia solo la semantica del terzo parametro, che ora conta come **giorno di calendario UTC** e non come istante.

- [x] **Step 1: Scrivere il test che fallisce**

Aggiungere in fondo a `test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts` (gli helper `freshTables`, `docente`, `resolverFor`, `byColumn` sono già in cima al file):

```ts
test('the last day of a SUPPLENZE window still resolves to the supplente at any time of day', () => {
  const tables = freshTables();
  tables.DOCENTI!.push(docente('sup@school.test'));
  tables.SUPPLENZE = [
    {
      TITOLARE: 'main@school.test',
      SUPPLENTE: 'sup@school.test',
      DAL: '2026-10-01',
      AL: '2026-10-15',
      CLASSI: '5A',
      MATERIE: 'MAT'
    }
  ];
  const { resolver, classe5A } = resolverFor(tables);

  const ultimoGiorno = resolver.resolveMateria(
    classe5A,
    MateriaId.of('MAT'),
    new Date('2026-10-15T09:30:00Z')
  );
  const giornoDopo = resolver.resolveMateria(
    classe5A,
    MateriaId.of('MAT'),
    new Date('2026-10-16T09:30:00Z')
  );

  expect(byColumn(ultimoGiorno, 'MAT').docenteEffettivo.id).toBe('sup@school.test');
  expect(byColumn(giornoDopo, 'MAT').docenteEffettivo.id).toBe('main@school.test');
});
```

- [x] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts -t "last day of a SUPPLENZE window"`
Expected: FAIL — `expect(received).toBe(expected)` con `received: "main@school.test"` sulla prima assert (l'ultimo giorno viene già risolto sul titolare).

- [x] **Step 3: Implementare la normalizzazione**

In `src/infrastructure/role-resolution/AldoTeachingAssignmentResolver.ts`, aggiungere la funzione subito sopra `export class AldoTeachingAssignmentResolver`:

```ts
/**
 * `SUPPLENZE.DAL`/`AL` e `VARIAZIONI_CATTEDRA.DAL` sono date di calendario
 * (`YYYY-MM-DD`) che RoleResolutionLib parsa a mezzanotte UTC e confronta come
 * istanti (`asOf <= validTo`, `AssignmentCandidate.isValidAt`). Un `asOf` con
 * l'ora escluderebbe l'ultimo giorno della supplenza. Questo è l'unico punto di
 * normalizzazione: ogni risoluzione ALDO passa da `resolveMateria`.
 * ponytail: la giornata è quella UTC — un job lanciato fra mezzanotte e le 02:00
 * italiane ricade nel giorno UTC precedente. Se emerge, normalizzare qui su
 * Europe/Rome.
 */
function giornoDiCalendario(data: Date): Date {
  return new Date(`${data.toISOString().slice(0, 10)}T00:00:00.000Z`);
}
```

e usarla nella `resolve`:

```ts
      return configuration
        .resolve(giornoDiCalendario(data), routingPolicy ?? null)
        .map((result) => this.toTeachingAssignment(result));
```

- [x] **Step 4: Eseguire il test e verificare che passi**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts -t "last day of a SUPPLENZE window"`
Expected: PASS

- [x] **Step 5: Togliere la normalizzazione duplicata a monte**

In `src/application/context-engine/providers/ConsiglioClasseProvider.ts` sostituire la riga 34:

```ts
    const data = new Date(cdu.meta.timestamp);
```

(la normalizzazione a giorno ora avviene a valle, nel resolver; tenerne due significa tenere due convenzioni.)

- [x] **Step 6: Allineare la fixture online alla forma reale del dato**

In `src/onlinetests/data/fixtures.ts` la costante mascherava il difetto codificando il fine giornata. `SupplenzaRepository.ts:86` scrive `YYYY-MM-DD`:

```ts
export const SUPPLENZA_FINE = new Date('2026-10-15T00:00:00Z');
```

`src/onlinetests/checks/supplenzeRuoliChecks.ts:269` ("AL inclusivo") e `:276` (FINE + 24h) restano validi: il primo ora verifica la mezzanotte del giorno finale, il secondo il giorno successivo.

- [x] **Step 7: Eseguire l'intera suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS. Se `test/unit/application/context-engine/consiglio-provider.test.ts` o `swap-supplenti.test.ts` falliscono su un caso di confine, l'atteso corretto è quello nuovo (ultimo giorno incluso): aggiornare l'assert, non il codice.

- [x] **Step 8: Commit**

```bash
git add src/infrastructure/role-resolution/AldoTeachingAssignmentResolver.ts src/application/context-engine/providers/ConsiglioClasseProvider.ts src/onlinetests/data/fixtures.ts test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts
git commit -m "fix(role-resolution): normalize asOf to the calendar day at the resolver boundary"
```

---

## Task 2: batch email, ripresa per identità logica (audit §2)

`EmailBatchService` ri-enumera i target a ogni run e riprende da `resume.nextIndex`. Un ritiro o una nuova iscrizione fra due run sposta gli indici: esattamente un target saltato in modo permanente per ogni scostamento. `emailTargetId` (`src/application/email/saluto.ts:42`) è già l'identità logica usata dalla deduplica LOG_MAIL e include `carenzaProgressivo`, quindi distingue due carenze dello stesso studente — cosa che `processed` (che contiene `target.target`) non fa.

**Files:**
- Modify: `src/application/services/EmailBatchService.ts:18-40` (stato), `:54-62` (docstring), `:228-284` (`suspendForQuota`), `:304-416` (handler)
- Test: `test/unit/application/email-batch-service.test.ts`

**Interfaces:**
- Consumes: `emailTargetId(target: EmailTarget): string` da `src/application/email/saluto.ts`.
- Produces: `EmailBatchCheckpoint` guadagna `processedIds: string[]` (cumulativo su tutti i run del job). `nextIndex` resta nel checkpoint come **contatore di avanzamento** (target completati in totale), non è più il punto di ripresa.

- [x] **Step 1: Scrivere il test che fallisce**

In `test/unit/application/email-batch-service.test.ts`, accanto al test `resume restarts from resumeState.nextIndex...`:

```ts
test('resume skips targets already processed even when enumeration shifts (audit §2)', () => {
  const { gmail, service } = wire();
  // Il primo run ha già inviato al target '5A'; alla ripresa l'enumerazione
  // restituisce solo '1F' in prima posizione (5A ritirata dal giro): riprendere
  // per indice invierebbe a nessuno o al target sbagliato.
  const { result } = drain(
    service.batchSendHandler({
      patternId: 'CDC_OTTOBRE',
      chunkSize: 1,
      resumeState: {
        nextIndex: 1,
        processedIds: ['cdc:5A'],
        processed: ['5A'],
        sent: 1,
        errors: [],
        failedTargets: []
      }
    })
  );

  expect(gmail.sent).toHaveLength(1);
  expect(result.processed).toEqual(['5A', '1F']);
  expect(result.sent).toBe(2);
});

test('a quota checkpoint carries the logical ids of every processed target', () => {
  const { service, gmail } = wire();
  gmail.remainingQuota = 1;
  const { checkpoints } = drain(
    service.batchSendHandler({ patternId: 'CDC_OTTOBRE', chunkSize: 1, resumeState: null })
  );

  expect(checkpoints[0]!.processedIds).toEqual(['cdc:5A']);
});
```

- [x] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx jest --config jest.config.cjs test/unit/application/email-batch-service.test.ts -t "audit §2"`
Expected: FAIL — TypeScript rifiuta `processedIds` (proprietà inesistente su `EmailBatchResumeState`).

- [x] **Step 3: Estendere lo stato di ripresa**

In `src/application/services/EmailBatchService.ts`, dentro `interface EmailBatchResumeState`, sotto `processed: string[];`:

```ts
  /**
   * Identità logiche (`emailTargetId`) dei target già processati, cumulative su
   * tutti i run del job. Sostituisce `nextIndex` come punto di ripresa: gli
   * indici non sopravvivono a un'enumerazione che cambia fra due run (ritiri,
   * nuove iscrizioni, variazioni di organico) — audit 2026-09-05 §2.
   */
  processedIds?: string[];
```

e cambiare il commento di `nextIndex` in:

```ts
  /** Contatore di avanzamento (target completati in totale), non un punto di ripresa: vedi `processedIds`. */
  nextIndex: number;
```

- [x] **Step 4: Riprendere dal set invece che dall'indice**

Sempre in `batchSendHandler`, sostituire il blocco `:309-316`:

```ts
      const doneIds = new Set(resume?.processedIds ?? []);
      const enumerati = this.email.enumerateTargets(config);
      const targets = enumerati.filter((target) => !doneIds.has(emailTargetId(target)));
      const totale = doneIds.size + targets.length;

      const processed = resume === null ? [] : resume.processed.slice();
      const processedIds = resume?.processedIds?.slice() ?? [];
      const errors = resume === null ? [] : resume.errors.slice();
      const failedTargets = resume?.failedTargets?.slice() ?? [];
      let sent = resume?.sent ?? 0;
      let i = 0;
      this.logger?.logBatchStart(targets.length);
```

Aggiungere l'import in cima al file, se assente:

```ts
import { emailTargetId } from '../email/saluto';
```

- [x] **Step 5: Sostituire `targets.length` con `totale` dove indica il totale del job**

Nel corpo del `while`/`for` e nelle chiamate di logging, `targets.length` continua a indicare *quanti ne restano in questo run*, mentre il totale del job è `totale`. Sostituzioni puntuali:

```ts
        this.logger?.logItemStart(doneIds.size + i + 1, totale, 'Target', targetHeader, 'EMAIL');
```

```ts
        const percentage = ((doneIds.size + i) / totale) * 100;
```

```ts
        this.monitor?.updateProgress(
          jobId,
          percentage,
          `${processed.length}/${totale} destinatari elaborati: ${progressDetail}`
        );
```

e, nel `push` dei target completati (subito dopo `processed.push(target.target);`):

```ts
        processedIds.push(emailTargetId(target));
```

Nel checkpoint yieldato (`:401-416`) sostituire `nextIndex: i` con:

```ts
          nextIndex: doneIds.size + i,
          processed: processed.slice(),
          processedIds: processedIds.slice(),
```

Nel blocco finale (`:419-440`) e nella `backfillSospesoTempo` (`:322`) sostituire `targets.length` con `totale`, e nel `return` finale `totale: targets.length` con `totale`.

- [x] **Step 6: Propagare gli id anche al checkpoint di sospensione per quota**

In `suspendForQuota`, aggiungere il parametro dopo `processed: string[],`:

```ts
    processedIds: string[],
```

e nel `resumeState` costruito, sotto `processed: processed.slice(),`:

```ts
      processedIds: processedIds.slice(),
```

Aggiornare le due chiamate (`:328` e `:380`) passando `processedIds` subito dopo `processed`, e sostituendo `targets.length` con `totale` nell'argomento `total`.

- [x] **Step 7: Aggiornare il docstring dell'assunzione rimossa**

In `src/application/services/EmailBatchService.ts:59-61` sostituire la frase sull'enumerazione stabile:

```
 * `params.resumeState`. I target vengono ri-enumerati a ogni run e quelli già
 * processati sono esclusi per identità logica (`emailTargetId`, la stessa della
 * deduplica LOG_MAIL): l'enumerazione NON deve essere stabile fra un run e
 * l'altro — ritiri e nuove iscrizioni sono normali (audit 2026-09-05 §2).
```

- [x] **Step 8: Aggiornare i resumeState dei test esistenti**

Nei test che costruiscono a mano un `resumeState` (`test/unit/application/email-batch-service.test.ts:193, 261, 493, 520, 571, 598, 643`) aggiungere `processedIds` coerente con `processed`. Per i target `PER_CDC` della fixture l'id è `cdc:<classe>`, quindi `processed: ['5A']` diventa:

```ts
      resumeState: { nextIndex: 1, processedIds: ['cdc:5A'], processed: ['5A'], sent: 1, errors: [] }
```

Rinominare il test `resume restarts from resumeState.nextIndex without resending (JobRunnerLib contract)` in `resume restarts from the processed logical ids without resending (JobRunnerLib contract)`.

- [x] **Step 9: Eseguire i test e verificare che passino**

Run: `npx jest --config jest.config.cjs test/unit/application/email-batch-service.test.ts`
Expected: PASS (tutto il file)

- [x] **Step 10: Suite completa e commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/application/services/EmailBatchService.ts test/unit/application/email-batch-service.test.ts
git commit -m "fix(email): resume email batches by logical target id instead of positional index"
```

Nota per il messaggio di commit: gli stati persistiti *prima* del deploy non hanno `processedIds` e ripartono da zero; la deduplica LOG_MAIL (`EmailNotificationService.ts:243`) impedisce comunque i reinvii.

---

## Task 3: snapshot dei target per gli assi CLASSE e DIPARTIMENTO (audit §3)

Sei assi su otto congelano la lista dei target nel checkpoint (`planTargets`, `docenteClasseMateriaTargets`, `classeMateriaTargets`, `classeDocenteTargets`, `docenteTargets`, `alunnoTargets`). `generateClassi` e `generateDipartimenti` no: ricalcolano `findAttive()` / `findAll()` a ogni run e riprendono per indice. Stesso rischio del Task 2 e incoerenza interna allo stesso file.

**Files:**
- Modify: `src/application/services/DocumentBatchService.ts:55-77` (stato), `:955-1022` (`generateDipartimenti`), `:1024-1094` (`generateClassi`)
- Test: `test/unit/application/document-batch-service.test.ts`

**Interfaces:**
- Consumes: `IClasseRepository.findById(id: ClasseId): Classe | null`, già usato altrove nel file.
- Produces: `BatchResumeState` guadagna `classeTargets?: string[]` e `dipartimentoTargets?: string[]` (ID di classe / di dipartimento). Il pattern è identico a `alunnoTargets` (`:886-896`).

- [x] **Step 1: Scrivere i test che falliscono**

In `test/unit/application/document-batch-service.test.ts`, dentro il `describe('DocumentBatchService.generateDipartimenti', ...)`:

```ts
  test('resume consumes persisted dipartimentoTargets after the department source changes', () => {
    const { service, generated } = wireDipartimenti();
    const initial = service.batchGenerateHandler({
      confDocId: 'VERBALE_DIPARTIMENTO',
      jobId: 'job_dip'
    });
    const first = initial.next();
    expect(first.done).toBe(false);
    expect(first.value).toMatchObject({ dipartimentoTargets: ['LETTERE', 'SCIENZE'] });

    const { result } = drain(service.batchGenerateHandler({ resumeState: first.value }));

    expect(generated.map((g) => g.dipartimentoId)).toEqual(['LETTERE', 'SCIENZE']);
    expect(result).toMatchObject({ totale: 2, processed: ['LETTERE', 'SCIENZE'] });
  });

  test('a resume without persisted dipartimentoTargets fails loud', () => {
    const { service } = wireDipartimenti();
    expect(() =>
      service
        .batchGenerateHandler({
          resumeState: {
            confDocId: 'VERBALE_DIPARTIMENTO',
            jobId: 'job_dip',
            nextIndex: 1,
            processed: ['LETTERE'],
            errori: []
          }
        })
        .next()
    ).toThrow(ConfigurationError);
  });
```

e, accanto ai test `handler yields one resumable checkpoint per targeted class...`:

```ts
test('generateClassi persists its class targets and consumes them on resume (audit §3)', () => {
  const { service, generated } = wire();
  const initial = service.batchGenerateHandler({ confDocId: 'CD1', jobId: 'job_classi' });
  const first = initial.next();
  expect(first.done).toBe(false);
  expect(first.value).toMatchObject({ classeTargets: ['5A', '1F'] });

  const { result } = drain(service.batchGenerateHandler({ resumeState: first.value }));

  expect(generated).toEqual(['5A:CD1', '1F:CD1']);
  expect(result).toMatchObject({ totale: 2, processed: ['5A', '1F'] });
});

test('generateClassi resume without persisted classeTargets fails loud (audit §3)', () => {
  const { service } = wire();
  expect(() =>
    service
      .batchGenerateHandler({
        resumeState: {
          confDocId: 'CD1',
          jobId: 'job_classi',
          nextIndex: 1,
          processed: ['5A'],
          errori: []
        }
      })
      .next()
  ).toThrow(ConfigurationError);
});
```

- [x] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts -t "audit §3"`
Expected: FAIL — `classeTargets` non compare nel checkpoint (`toMatchObject` fallisce) e il resume senza target non lancia.

- [x] **Step 3: Estendere lo stato di ripresa**

In `interface BatchResumeState`, sotto `alunnoTargets?: AlunnoBatchTarget[];`:

```ts
  /** ID delle classi bersaglio, congelati alla prima run (audit 2026-09-05 §3). */
  classeTargets?: string[];
  /** ID dei dipartimenti bersaglio, congelati alla prima run (audit 2026-09-05 §3). */
  dipartimentoTargets?: string[];
```

- [x] **Step 4: Congelare i target dei dipartimenti**

In `generateDipartimenti`, sostituire la riga `const tutti = this.dipartimenti.findAll();` con:

```ts
    let tutti: string[];
    if (resume === null) {
      tutti = this.dipartimenti.findAll().map((dipartimento) => dipartimento.id ?? '?');
    } else {
      if (resume.dipartimentoTargets === undefined) {
        throw new ConfigurationError(
          `Stato di ripresa ${confDocId} privo dei target dipartimento persistiti`
        );
      }
      tutti = resume.dipartimentoTargets.slice();
    }
```

Nel corpo del ciclo, `const dipartimento = tutti[i]!;` e `const id = dipartimento.id ?? '?';` diventano una riga sola:

```ts
          const id = tutti[i]!;
```

e nel checkpoint yieldato aggiungere, sotto `esecuzioneIniziata: this.esecuzioneIniziata`:

```ts
            dipartimentoTargets: tutti
```

- [x] **Step 5: Congelare i target delle classi**

In `generateClassi`, sostituire il blocco `const attive = ...`:

```ts
    let attive: Classe[];
    if (resume === null) {
      attive = this.classi.filterPerGestioneArticolazione(
        this.classi.findAttive(),
        config.gestioneArticolazione
      );
    } else {
      if (resume.classeTargets === undefined) {
        throw new ConfigurationError(
          `Stato di ripresa ${confDocId} privo dei target classe persistiti`
        );
      }
      // Una classe sparita fra due run non deve uccidere il job: la si registra
      // come errore e si prosegue (audit 2026-09-05 §3).
      attive = resume.classeTargets.flatMap((id) => {
        const classe = this.classi.findById(ClasseId.of(id));
        if (classe === null) {
          errori.push(`${id}: classe non più presente in CLASSI — saltata`);
          return [];
        }
        return [classe];
      });
    }
```

e nel checkpoint yieldato aggiungere, sotto `esecuzioneIniziata: this.esecuzioneIniziata`:

```ts
            classeTargets: attive.map((classe) => classe.id ?? '')
```

Verificare che `ClasseId` e il tipo `Classe` siano importati nel file (lo sono: `ClasseId` è usato in `generateForClasse`, `Classe` nei tipi degli assi docente/classe). Se un import manca, aggiungerlo.

- [x] **Step 6: Eseguire i test e verificare che passino**

Run: `npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts`
Expected: PASS (tutto il file, inclusi i test preesistenti su `nextIndex` e sulle percentuali, che non cambiano)

- [x] **Step 7: Suite completa e commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/application/services/DocumentBatchService.ts test/unit/application/document-batch-service.test.ts
git commit -m "fix(documents): freeze class and department batch targets in the checkpoint"
```

---

## Task 4: le email carenza non partono per studenti ritirati (audit §9)

`targetsPerCarenza` risolve lo studente senza controllare `isAttivo()`, a differenza di `PER_ALUNNO` (`:347`) e `PER_GENITORI_ALUNNO` (`:597`), che partono da `findAttivi()`. Uno studente ritirato con una carenza aperta fa comunque partire la mail alla famiglia.

**Files:**
- Modify: `src/application/services/EmailNotificationService.ts:627-634`
- Test: `test/unit/application/email-notification-service.test.ts:544-575`

**Interfaces:**
- Consumes: `Alunno.isAttivo(): boolean` (`src/domain/entities/Alunno.ts:67`).
- Produces: nessuna firma nuova. `enumerateTargets(conf)` per i tre processi `PER_CARENZA_GENITORI*` restituisce solo target di studenti attivi.

**Attenzione:** nella fixture condivisa `a2@school.it` ha `ATTIVO: false` (`test/fixtures/tables.ts:178`) ed è uno dei due target carenza attesi dai test attuali. I tre test esistenti codificano il bug e vanno corretti in questo stesso task — è il difetto in produzione, non una regressione.

- [x] **Step 1: Scrivere il test che fallisce**

In `test/unit/application/email-notification-service.test.ts`, accanto agli altri test `PER_CARENZA_*`:

```ts
test('PER_CARENZA_GENITORI: a withdrawn student never triggers the family email (audit §9)', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_CARENZA_GENITORI'));
  expect(targets.map((t) => t.target)).toEqual(['a1@school.it']); // a2 è ATTIVO=false
});
```

- [x] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts -t "audit §9"`
Expected: FAIL — `Received: ["a1@school.it", "a2@school.it"]`

- [x] **Step 3: Implementare il filtro**

In `src/application/services/EmailNotificationService.ts`, in `targetsPerCarenza`, subito dopo il blocco che gestisce `alunno === null`:

```ts
      // Coerente con PER_ALUNNO e PER_GENITORI_ALUNNO, che partono da
      // findAttivi(): un ritiro non è un'anomalia di dati, nessun warn.
      if (!alunno.isAttivo()) continue;
```

- [x] **Step 4: Eseguire il test e verificare che passi**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts -t "audit §9"`
Expected: PASS

- [x] **Step 5: Correggere i tre test che codificavano il bug**

In `test/unit/application/email-notification-service.test.ts`:

```ts
test('PER_CARENZA_GENITORI: one target per non-notified CARENZE row; tutors first, alunno fallback (11 §3)', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_CARENZA_GENITORI'));
  expect(targets).toHaveLength(1); // a1 prog 1 (a1 prog 2 già notificata; a2 è ritirato)
  const a1 = targets.find((t) => t.target === 'a1@school.it')!;
  expect(a1.carenzaProgressivo).toBe(1);
  expect(a1.emails).toEqual(['genitore1@x.it']);
});

test('PER_CARENZA_GENITORI_E_ALUNNO: one shared target per non-notified CARENZE row, tutors + alunno', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_CARENZA_GENITORI_E_ALUNNO'));
  expect(targets).toHaveLength(1);
  const a1 = targets.find((t) => t.target === 'a1@school.it')!;
  expect(a1.tipo).toBe('genitori_alunno');
  expect(a1.emails.sort()).toEqual(['a1@school.it', 'genitore1@x.it']);
  expect(a1.carenzaProgressivo).toBe(1);
});

test('PER_CARENZA_GENITORI_E_COORD: parents in To, class coordinatore in Cc', () => {
  const { service } = wire();
  const targets = service.enumerateTargets(conf('PER_CARENZA_GENITORI_E_COORD'));
  expect(targets).toHaveLength(1);
  const a1 = targets.find((t) => t.target === 'a1@school.it')!;
  expect(a1.tipo).toBe('genitori');
  expect(a1.emails).toEqual(['genitore1@x.it']);
  expect(a1.cc).toEqual(['rossi@school.it']); // 5A coordinatore (fixture)
});
```

- [x] **Step 6: Eseguire i test e verificare che passino**

Run: `npx jest --config jest.config.cjs test/unit/application/email-notification-service.test.ts`
Expected: PASS (tutto il file)

- [x] **Step 7: Suite completa e commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/application/services/EmailNotificationService.ts test/unit/application/email-notification-service.test.ts
git commit -m "fix(email): skip withdrawn students when enumerating carenza targets"
```

---

## Task 5: `getStudenti` con default sicuro (audit §4)

`RappresentantiProvider` elenca anche i ritirati perché `ClasseRepository.getStudenti(classe, soloAttivi = false)` ha il default insicuro. Il fix alla radice è invertire il default: sei call site su otto passano già `true` o filtrano a valle, solo `ReportService` vuole `false` e lo passa esplicitamente. Così anche ogni futuro chiamante nasce corretto.

Verifica dei call site (già fatta, non ripeterla):

| Call site | Oggi | Dopo |
|---|---|---|
| `ReportService.ts:86,160` | `false` esplicito | invariato |
| `studenti.ts:17,19` | parametro esplicito | invariato |
| `StoricoClasseProvider.ts:48`, `PianiPersClasseProvider.ts:52` | `true` esplicito | invariato |
| `StudentiProvider.ts:40` | default + `.filter(isAttivo)` a valle | invariato di fatto |
| `RappresentantiProvider.ts:22` | default `false` — **il bug** | corretto |

**Files:**
- Modify: `src/infrastructure/repositories/ClasseRepository.ts:231`
- Modify: `src/domain/repositories/IClasseRepository.ts:44`
- Test: `test/unit/application/context-engine/classe-provider.test.ts`

**Interfaces:**
- Produces: `IClasseRepository.getStudenti(classe: Classe, soloAttivi?: boolean): Alunno[]` — il default diventa `true`.

- [x] **Step 1: Scrivere il test che fallisce**

In `test/unit/application/context-engine/classe-provider.test.ts`, accanto al test `RappresentantiProvider: student reps with email...` (l'helper `build(target, tables?)` è già in cima al file):

```ts
test('RappresentantiProvider: a withdrawn student is not listed as representative (audit §4)', () => {
  const tables = fixtureTables();
  (tables.ALUNNI as Row[]).push({
    EMAIL: 'ritirato@school.it',
    COGNOMENOME: 'RITIRATO RENZO',
    CLASSE: '5A',
    RELIGIONE: 'IRC',
    ATTIVO: false,
    RIPETENTE: false,
    RAPPR_STUD: true,
    RAPPR_GEN: 'Genitore Ritirato',
    CURRICULUM: null
  });

  const c = build('5A', tables).focus.classe!;

  expect(c.rappresentanti?.studenti.elenco.map((r) => r.studente.email)).toEqual(['a1@school.it']);
  expect(c.rappresentanti?.genitori.elenco).toEqual([]);
});
```

- [x] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/classe-provider.test.ts -t "audit §4"`
Expected: FAIL — l'elenco contiene anche `ritirato@school.it` e il rappresentante genitore corrispondente.

- [x] **Step 3: Invertire il default**

In `src/infrastructure/repositories/ClasseRepository.ts:231`:

```ts
  getStudenti(classe: Classe, soloAttivi = true): Alunno[] {
```

In `src/domain/repositories/IClasseRepository.ts:44`:

```ts
  /** Studenti della classe; `soloAttivi` è true per default — passare `false` solo dove i ritirati servono davvero (es. ReportService). */
  getStudenti(classe: Classe, soloAttivi?: boolean): Alunno[];
```

- [x] **Step 4: Eseguire il test e verificare che passi**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/classe-provider.test.ts -t "audit §4"`
Expected: PASS

- [x] **Step 5: Verificare i test che si appoggiavano al vecchio default**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/classe-cattedre.test.ts test/unit/infrastructure/piano-repository.test.ts test/unit/application/context-engine/studenti.test.ts test/unit/application/report-service.test.ts`
Expected: PASS. Se un test falliva perché contava sui ritirati inclusi *per default*, rendere il parametro esplicito nel test (`getStudenti(classe, false)`) invece di rimettere il default insicuro.

- [x] **Step 6: Suite completa e commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/infrastructure/repositories/ClasseRepository.ts src/domain/repositories/IClasseRepository.ts test/unit/application/context-engine/classe-provider.test.ts
git commit -m "fix(classi): default getStudenti to active students only"
```

---

## Task 6: flag di ruolo del destinatario risolti live (audit §6)

`emailSteps.ts:235-241` scrive costanti: `ruoliAttivi: []`, `isTutor: false`, `isTutorAsl: false`, `isDocenteSostegno: false`, e `isCoordinatore` derivato dal **processo di invio** invece che da chi è coordinatore oggi. I flag per membro del CdC, invece, sono già risolti live (`TeachingCouncilProjection.ts:445-451`): il fix riusa quella stessa sorgente.

**Prerequisito bloccante:** confermare l'ID della riga MATERIE del sostegno (vedi "Decisioni già prese"). Il piano usa `'SOS'`.

**Files:**
- Modify: `src/config/schema.ts` (in coda alle costanti di colonna)
- Modify: `src/application/context-engine/TeachingCouncilProjection.ts:186`
- Modify: `src/application/pipelines/emailSteps.ts:208-253`
- Test: `test/unit/application/pipelines/email-steps.test.ts`

**Interfaces:**
- Consumes: `IClasseRepository.getCoordinatori(classe)`, `IClasseRepository.getDocentiRuoloArticolato(classe, nomeRuolo)`, `ClasseId.of(id)`, `MateriaVM.sigla` (che è l'ID della materia, `subjectVmMapper.ts:34`).
- Produces: `export function descrizione(isCoordinatore: boolean, isTutorAsl: boolean, isTutorOrientamento: boolean): string[]` da `TeachingCouncilProjection.ts`; `export const MATERIA_SOSTEGNO: string` da `schema.ts`.

- [x] **Step 1: Scrivere i test che falliscono**

In `test/unit/application/pipelines/email-steps.test.ts` (helper `wire`, `buildStep`, `docenteTarget` già presenti in cima al file):

```ts
test('BuildCDUStep resolves destinatario role flags from CLASSI, not from the PROCESSO (audit §6)', () => {
  // Fixture 5A: COORD=rossi, RUOLI.TUTOR_ASL=rossi,bianchi.
  const w = wire({ PROCESSO: 'PER_DOCENTE' }, docenteTarget());
  buildStep(w).execute(w.ctx);

  const d = w.ctx.get<Cdu>('cdu')!.destinatario!;
  expect(d.isCoordinatore).toBe(true);
  expect(d.isTutorAsl).toBe(true);
  expect(d.isTutor).toBe(true);
  expect(d.ruoliAttivi).toEqual(['Coordinatore', 'Tutor ASL', 'Docente']);
  expect(d.hasRuoliAttivi).toBe(true);
});

test('BuildCDUStep marks a non-coordinatore false even on a PER_COORDINATORE send (audit §6)', () => {
  const target = { ...docenteTarget(), docenteEmail: 'bianchi@school.it', emails: ['bianchi@school.it'] };
  const w = wire({ PROCESSO: 'PER_COORDINATORE' }, target);
  buildStep(w).execute(w.ctx);

  const d = w.ctx.get<Cdu>('cdu')!.destinatario!;
  expect(d.isCoordinatore).toBe(false); // bianchi non coordina 5A
  expect(d.isTutorAsl).toBe(true); // ma è tutor ASL
});
```

- [x] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts -t "audit §6"`
Expected: FAIL — `isCoordinatore` è `false` nel primo test (deriva dal processo `PER_DOCENTE`) e `true` nel secondo.

- [x] **Step 3: Aggiungere la costante del sostegno**

In `src/config/schema.ts`, dopo `COL_MATERIE`:

```ts
/**
 * ID della riga MATERIE che rappresenta il sostegno: nella matrice CLASSI il
 * sostegno è una colonna materia come le altre. Allineare al valore reale del
 * foglio MATERIE (audit 2026-09-05 §6).
 */
export const MATERIA_SOSTEGNO = 'SOS';
```

- [x] **Step 4: Esportare la descrizione dei ruoli**

In `src/application/context-engine/TeachingCouncilProjection.ts:186`, aggiungere `export`:

```ts
export function descrizione(
```

- [x] **Step 5: Risolvere i flag live**

In `src/application/pipelines/emailSteps.ts` aggiungere agli import esistenti:

```ts
import { descrizione as descrizioneRuoli } from '../context-engine/TeachingCouncilProjection';
import { MATERIA_SOSTEGNO } from '../../config/schema';
```

Nel metodo `buildDestinatario`, dopo la riga `const { cattedre, materieCompetenza } = this.buildCattedre(t, classiCompetenza, when);`:

```ts
    const ruoli = this.ruoliDestinatario(docente, classiCompetenza);
    const isDocenteSostegno = materieCompetenza.some(
      (materia) =>
        materia.sigla === MATERIA_SOSTEGNO || materia.sigla.startsWith(`${MATERIA_SOSTEGNO}.`)
    );
```

e sostituire il blocco di costanti nel `return`:

```ts
      ruoliAttivi: ruoli.elenco,
      hasRuoliAttivi: ruoli.elenco.length > 0,
      isCoordinatore: ruoli.isCoordinatore,
      isTutor: ruoli.isTutorAsl || ruoli.isTutorOrientamento,
      isTutorAsl: ruoli.isTutorAsl,
      isDocenteSostegno,
```

Aggiungere il metodo privato subito dopo `buildDestinatario`:

```ts
  /**
   * Ruoli del destinatario risolti live da CLASSI.COORD / CLASSI.RUOLI sulle
   * classi di competenza — stessa sorgente dei flag per membro del CdC
   * (`TeachingCouncilProjection`). Prima erano costanti e `isCoordinatore`
   * derivava dal PROCESSO di invio, che è un'altra cosa (audit 2026-09-05 §6).
   */
  private ruoliDestinatario(
    docente: Docente | null,
    classiCompetenza: string[]
  ): {
    elenco: string[];
    isCoordinatore: boolean;
    isTutorAsl: boolean;
    isTutorOrientamento: boolean;
  } {
    const email = docente?.id ?? '';
    if (email === '') {
      return { elenco: [], isCoordinatore: false, isTutorAsl: false, isTutorOrientamento: false };
    }
    const classi = classiCompetenza
      .map((id) => this.classi.findById(ClasseId.of(id)))
      .filter((classe): classe is Classe => classe !== null);
    const contiene = (docenti: Docente[]): boolean => docenti.some((d) => d.id === email);
    const isCoordinatore = classi.some((classe) => contiene(this.classi.getCoordinatori(classe)));
    const isTutorAsl = classi.some((classe) =>
      contiene(this.classi.getDocentiRuoloArticolato(classe, 'TUTOR_ASL'))
    );
    const isTutorOrientamento = classi.some((classe) =>
      contiene(this.classi.getDocentiRuoloArticolato(classe, 'TUTOR_ORIENT'))
    );
    return {
      elenco: descrizioneRuoli(isCoordinatore, isTutorAsl, isTutorOrientamento),
      isCoordinatore,
      isTutorAsl,
      isTutorOrientamento
    };
  }
```

`Docente` e `Classe` sono già importati come tipi nel file; se il typecheck segnala il contrario, aggiungere gli import mancanti.

- [x] **Step 6: Eseguire i test e verificare che passino**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts`
Expected: PASS (tutto il file)

- [x] **Step 7: Suite completa e commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/config/schema.ts src/application/context-engine/TeachingCouncilProjection.ts src/application/pipelines/emailSteps.ts test/unit/application/pipelines/email-steps.test.ts
git commit -m "fix(email): resolve destinatario role flags from CLASSI instead of hardcoding them"
```

---

## Task 7: visibilità per utente risolta live (audit §5)

`AlberoCartelle.ts:76` unisce e non pota mai il CSV `UTENTI`; `AggregatoreDati.getDocumentiPerUtente/getCartellePerUtente` decidono cosa un utente riceve leggendo quel CSV registrato in passato. Risultato: chi ha perso la cattedra continua a ricevere link a tempo indeterminato, chi è arrivato in corso d'anno non matcha nulla. Le classi di competenza attuali sono già calcolate a monte (`sourceScopeFor`, `emailSteps.ts:122-140`): basta portarle fino al filtro. `UTENTI` resta audit trail, nessuna migrazione dati.

**Files:**
- Modify: `src/application/services/AggregatoreDati.ts:63-100` (accessor), `:130-140` (`perMetodo`), `:178-187` e `:215-224` (wrapper)
- Modify: `src/application/email/boxes.ts:623-631`
- Test: `test/unit/application/aggregatore-dati.test.ts`

**Interfaces:**
- Consumes: `LogDocumento.getClassi()/containsUtente(email)` e `LogCartella.getClassi()/containsUtente(email)` (stessa forma strutturale in entrambe le entità).
- Produces:
  - `AggregatoreDati.getDocumentiPerUtente(utenteEmail: string, filtri?: FiltriSorgente, classiCompetenza?: string[]): LogDocumento[]`
  - `AggregatoreDati.getCartellePerUtente(utenteEmail: string, filtri?: FiltriSorgente, classiCompetenza?: string[]): LogCartella[]`
  - `perMetodo` accetta `classiCompetenza?: string[]` fra i `params`.

- [x] **Step 1: Scrivere i test che falliscono**

In `test/unit/application/aggregatore-dati.test.ts`:

```ts
test('getDocumentiPerUtente hides class documents of a class the user no longer holds (audit §5)', () => {
  const tables = fixtureTables();
  tables.LOG_DOCS = [
    {
      ID: 'd-classe',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      STATO: 'GENERATO',
      UTENTI: 'exdocente@school.it',
      CLASSI: '5A',
      MATERIE: 'MATE'
    },
    {
      ID: 'd-personale',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      STATO: 'GENERATO',
      UTENTI: 'exdocente@school.it',
      CLASSI: '',
      MATERIE: ''
    }
  ];
  const agg = aggregatore(tables);

  // Oggi il docente non ha più 5A fra le competenze: resta solo il documento personale.
  expect(
    agg.getDocumentiPerUtente('exdocente@school.it', undefined, ['1F']).map((d) => d.id)
  ).toEqual(['d-personale']);
});

test('getDocumentiPerUtente shows class documents to a teacher who arrived mid-year (audit §5)', () => {
  const tables = fixtureTables();
  tables.LOG_DOCS = [
    {
      ID: 'd-classe',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      STATO: 'GENERATO',
      UTENTI: 'exdocente@school.it',
      CLASSI: '5A',
      MATERIE: 'MATE'
    }
  ];
  const agg = aggregatore(tables);

  expect(
    agg.getDocumentiPerUtente('nuovo@school.it', undefined, ['5A']).map((d) => d.id)
  ).toEqual(['d-classe']);
});

test('getCartellePerUtente without a live scope still falls back to the registered UTENTI (audit §5)', () => {
  const tables = fixtureTables();
  tables.LOG_FOLD = [
    {
      ID: 'f1',
      ID_GEN: 'CD1',
      TIPO: 'CARTELLA',
      NOME: 'Verbali',
      PATH: 'Verbali',
      LINK: 'https://drive.google.com/drive/folders/f1',
      UTENTI: 'exdocente@school.it',
      CLASSI: '5A',
      MATERIE: ''
    }
  ];
  const agg = aggregatore(tables);

  expect(agg.getCartellePerUtente('exdocente@school.it').map((c) => c.id)).toEqual(['f1']);
});
```

- [x] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx jest --config jest.config.cjs test/unit/application/aggregatore-dati.test.ts -t "audit §5"`
Expected: FAIL — il terzo argomento non esiste ancora (errore TypeScript sui primi due test).

- [x] **Step 3: Implementare il predicato di visibilità**

In `src/application/services/AggregatoreDati.ts`, come funzione di modulo (fuori dalla classe, accanto alle altre helper del file):

```ts
/**
 * Visibilità live (audit 2026-09-05 §5): il CSV UTENTI registrato in LOG_DOCS /
 * LOG_FOLD è un audit trail di chi era interessato alla generazione, non
 * l'appartenenza corrente — è append-only e non viene mai potato. Una riga con
 * CLASSI valorizzato è quindi visibile a chi ha oggi almeno una di quelle classi
 * fra le competenze; le righe senza CLASSI (documenti personali) restano sul CSV.
 * Senza scope live (chiamate batch, prerequisiti) si torna al comportamento
 * storico, che è il massimo che si può sapere in quel contesto.
 */
function visibileAUtente(
  riga: { getClassi(): string[]; containsUtente(email: string): boolean },
  utenteEmail: string,
  classiCompetenza: string[] | undefined
): boolean {
  const classi = riga.getClassi();
  if (classi.length === 0 || classiCompetenza === undefined || classiCompetenza.length === 0) {
    return riga.containsUtente(utenteEmail);
  }
  return classi.some((classeId) => classiCompetenza.includes(classeId));
}
```

Sostituire i due accessor:

```ts
  /** LOG_DOCS visibili all'utente: scope live sulle classi di competenza, CSV UTENTI per le righe personali (14 §2, audit §5). */
  getDocumentiPerUtente(
    utenteEmail: string,
    filtri?: FiltriSorgente,
    classiCompetenza?: string[]
  ): LogDocumento[] {
    return this.filterDocumenti(
      this.allDocumenti().filter((documento) =>
        visibileAUtente(documento, utenteEmail, classiCompetenza)
      ),
      filtri
    );
  }
```

```ts
  /** LOG_FOLD visibili all'utente: stessa regola di getDocumentiPerUtente (14 §2, audit §5). */
  getCartellePerUtente(
    utenteEmail: string,
    filtri?: FiltriSorgente,
    classiCompetenza?: string[]
  ): LogCartella[] {
    return this.filterCartelle(
      this.allCartelle().filter((cartella) =>
        visibileAUtente(cartella, utenteEmail, classiCompetenza)
      ),
      filtri
    );
  }
```

- [x] **Step 4: Propagare lo scope attraverso `perMetodo`**

In `perMetodo`, aggiungere al tipo inline dei `params`, dopo `utenteEmail?: string;`:

```ts
      classiCompetenza?: string[];
```

Nei due wrapper privati, passare il terzo argomento:

```ts
    return this.getDocumentiPerUtente(params.utenteEmail, filtri, params.classiCompetenza);
```

```ts
    return this.getCartellePerUtente(params.utenteEmail, filtri, params.classiCompetenza);
```

- [x] **Step 5: Passare le classi di competenza dal box**

In `src/application/email/boxes.ts`, nel ramo non-`PerClasse` di `resolveSourceItems`:

```ts
    : [
        aggregatoreDati.perMetodo(metodo, {
          ...(scope?.utenteEmail === undefined ? {} : { utenteEmail: scope.utenteEmail }),
          ...(scope?.classiCompetenza === undefined
            ? {}
            : { classiCompetenza: scope.classiCompetenza }),
          ...(scope?.dipartimentoId === undefined
            ? {}
            : { dipartimentoId: scope.dipartimentoId }),
          ...(filtri === undefined ? {} : { filtri })
        }, logger)
      ];
```

- [x] **Step 6: Eseguire i test e verificare che passino**

Run: `npx jest --config jest.config.cjs test/unit/application/aggregatore-dati.test.ts test/unit/application/email-boxes.test.ts`
Expected: PASS. Il test preesistente `getDocumentiPerUtente scopes UTENTI before applying document filters (14 §2)` chiama senza scope e continua a passare per il ramo di fallback.

- [x] **Step 7: Suite completa e commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/application/services/AggregatoreDati.ts src/application/email/boxes.ts test/unit/application/aggregatore-dati.test.ts
git commit -m "fix(boxes): resolve per-user document and folder visibility from live class competence"
```

---

## Task 8: `staff` espone tutti i titolari di un ruolo (audit §7)

`SchoolProvider.ts:19` prende `ruolo.getEmails()[0]`, mentre `RuoloSpeciale` modella "uno o più docenti" e `RisolutoreRuoliService.referente` li restituisce tutti: `cdu.istituto.staff` mostra un solo titolare mentre l'ACL per lo stesso ruolo li abilita tutti. `persona` resta il primo titolare, così nessun template esistente si rompe.

**Files:**
- Modify: `src/application/context-engine/Cdu.ts:463-468`
- Modify: `src/application/context-engine/providers/SchoolProvider.ts:16-40`
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md:154-160`
- Test: `test/unit/application/context-engine/providers/school-provider.test.ts`

**Interfaces:**
- Consumes: `RuoloSpeciale.getEmails(): Email[]`.
- Produces: `RuoloStaffVM` guadagna `persone: PersonaVM[]` e `hasPersone: boolean`; `persona`/`hasPersona` restano invariati (primo titolare).

- [x] **Step 1: Scrivere il test che fallisce**

In `test/unit/application/context-engine/providers/school-provider.test.ts`, dentro il `describe('SchoolProvider', ...)`:

```ts
  it('exposes every holder of a role, not just the first (audit §7)', () => {
    const master: Pick<IMasterSheetRepository, 'findConfigAnnoCorrente'> = {
      findConfigAnnoCorrente: () =>
        ({ annoScolasticoRaw: '2025-2026', dirigente: 'Prof.ssa Maria Bianchi' }) as never
    };
    const ruoli: Pick<IRuoloSpecialeRepository, 'findAllCached'> = {
      findAllCached: () =>
        [
          {
            id: 'REF_BES',
            getEmails: () => [{ value: 'mario.rossi@scuola.edu.it' }, { value: 'lucia.verdi@scuola.edu.it' }]
          },
          { id: 'AN_DIG', getEmails: () => [] }
        ] as never
    };
    const docenti: Pick<IDocenteRepository, 'findById'> = {
      findById: (email: string) =>
        (email === 'mario.rossi@scuola.edu.it'
          ? { nome: 'Mario', cognome: 'Rossi', genere: 'M', id: email }
          : email === 'lucia.verdi@scuola.edu.it'
            ? { nome: 'Lucia', cognome: 'Verdi', genere: 'F', id: email }
            : null) as never
    };
    const provider = new SchoolProvider(master as never, ruoli as never, docenti as never);
    const cdu = makeCdu();

    provider.provide(cdu);

    const refBes = cdu.istituto!.staff.perId.REF_BES!;
    expect(refBes.persone.map((p) => p.email)).toEqual([
      'mario.rossi@scuola.edu.it',
      'lucia.verdi@scuola.edu.it'
    ]);
    expect(refBes.hasPersone).toBe(true);
    expect(refBes.persona?.email).toBe('mario.rossi@scuola.edu.it'); // compat: primo titolare
    const anDig = cdu.istituto!.staff.perId.AN_DIG!;
    expect(anDig.persone).toEqual([]);
    expect(anDig.hasPersone).toBe(false);
  });
```

- [x] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/school-provider.test.ts -t "audit §7"`
Expected: FAIL — `persone` non esiste su `RuoloStaffVM` (errore TypeScript).

- [x] **Step 3: Estendere il view-model**

In `src/application/context-engine/Cdu.ts`:

```ts
export interface RuoloStaffVM {
  ruoloId: string;
  ruoloNome: string;
  /** Primo titolare risolto; null se il ruolo non è assegnato. Mantenuto per i template esistenti. */
  persona: PersonaVM | null;
  hasPersona: boolean;
  /** Tutti i titolari del ruolo, nell'ordine configurato (audit 2026-09-05 §7). */
  persone: PersonaVM[];
  hasPersone: boolean;
}
```

- [x] **Step 4: Risolvere tutti i titolari**

In `src/application/context-engine/providers/SchoolProvider.ts`, sostituire il corpo del `map`:

```ts
    const elenco = this.ruoli.findAllCached().map((ruolo) => {
      const persone = ruolo
        .getEmails()
        .map((email) => this.persona(email.value))
        .filter((persona): persona is PersonaVM => persona !== null);
      const persona = persone[0] ?? null;
      return {
        ruoloId: ruolo.id ?? '',
        ruoloNome: ruolo.nome,
        persona,
        hasPersona: persona !== null,
        persone,
        hasPersone: persone.length > 0
      };
    });
```

- [x] **Step 5: Eseguire il test e verificare che passi**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/school-provider.test.ts`
Expected: PASS (tutto il file: il test preesistente su `persona`/`perId` non cambia)

- [x] **Step 6: Aggiornare il contratto CDU**

In `SPECS_ALDO/02_CDU_STRUTTURA.md`, nel blocco `RuoloStaffVM`:

```yaml
RuoloStaffVM:
  ruoloId: string # Identificativo configurato del ruolo
  ruoloNome: string # Denominazione leggibile del ruolo; es. "Coordinatore di classe"
  persona: PersonaVM | null # Primo titolare risolto; null se non assegnato
  hasPersona: boolean # true se persona è valorizzata
  persone: PersonaVM[] # Tutti i titolari del ruolo, nell'ordine configurato
  hasPersone: boolean # true se il ruolo ha almeno un titolare
```

- [x] **Step 7: Suite completa e commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/providers/SchoolProvider.ts SPECS_ALDO/02_CDU_STRUTTURA.md test/unit/application/context-engine/providers/school-provider.test.ts
git commit -m "feat(cdu): expose every holder of a RUOLI role in istituto.staff"
```

---

## Chiusura

- [x] **Aggiornare `AUDIT_REAL_DATA.md`**: sostituire ogni `TODO: to fix` con `FIXED (task N)`, e aggiungere in coda al §5 la nota sull'ACL Drive unidirezionale come debito noto e non risolto.
- [x] **Verifica finale**: `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build`
- [x] **Build online** (i Task 1 e 2 toccano comportamenti coperti dagli online test): `npm run build:testing` — non fare `clasp push` senza conferma dell'utente.
