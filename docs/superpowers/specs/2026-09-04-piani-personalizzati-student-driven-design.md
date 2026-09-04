# focus.classe.pianiPersonalizzati: student-driven join

## Problem

`PianiPersClasseProvider` (src/application/context-engine/providers/PianiPersClasseProvider.ts) fills `focus.classe.pianiPersonalizzati` by scanning `LOG_DOCS` for rows tagged with the focus class (`LOG_DOCS.CLASSI` contains the class ID), filtered to `TIPO=PIANO_PERS`. This is class-tag-driven, not roster-driven:

- A student who transferred out still shows (their old doc's `CLASSI` tag never changes — append-only audit trail).
- A student who transferred in doesn't show unless a new doc was generated after the move.
- `ALUNNI.ATTIVO` is never checked, contradicting `01_SCHEMA_DATABASE.md` §"Regola attività": a PIANI/LOG_DOCS record is active only if both the student AND their class are active.

## Design

Rebuild `PianiPersClasseProvider.provide` to iterate from the roster instead of from the doc log:

```
for classId in classIds (params.classiCompetenza ?? [params.target]):
  classe = classi.findById(classId)
  for alunno in classi.getStudenti(classe, /* soloAttivi */ true):   # ALUNNI.ATTIVO gate, built into IClasseRepository already
    for piano in alunni.getPiani(alunno):                            # PIANI table, findByAlunno
      matches = logDocs.findByUtente(alunno.email)
                  .filter(l => l.tipo === 'PIANO_PERS' && l.getSottotipo() === piano.tipo)
      if matches.length > 0:
        emit one PianoPersonalizzatoVM per match (existing buildDocumentoLogVm path)
      else:
        emit one placeholder PianoPersonalizzatoVM (no LOG_DOCS row yet)
```

No new repository methods: `getStudenti(classe, true)`, `alunni.getPiani(alunno)`, `logDocs.findByUtente(email)` all exist today.

### Placeholder VM

`PianoPersonalizzatoVM extends DocumentoLogVM` (Cdu.ts:401) already models "no document" via `id: string | null` / `hasId: boolean` (see `buildDocumentoStoricoVm`). No interface change. Placeholder fields:

```
id: null, hasId: false, nome: '', link: '',
tipo: 'PIANO_PERS', tipoLabel: 'PIANO_PERS',
sottotipo: piano.tipo, sottotipoLabel: tipoPianoLabel(piano.tipo), hasSottotipo: true,
generatoreId: '', stato: '', statoLabel: '',
isNotificato: false, dataCreazione: '', dataCreazioneBreve: '',
isVerbalizzato: false,
studente: { nomeCompleto: alunno.cognomeNome, email: alunno.email.value }, hasStudente: true
```

`studente`/`hasStudente` are always populated now (we hold the `Alunno` already — no more email-lookup-miss case).

`isVerbalizzato: false` → placeholders fall into `nonVerbalizzati` (correct: an ungenerated plan is the least-verbalized state there is).

Multi-doc case (regenerated docs) unchanged: one VM per matching `LOG_DOCS` row, no dedup.

`storico` LazyRef: email set is whatever `alunno.email` values got iterated (same set, now sourced from roster instead of doc `UTENTI` — falls out of the loop, not a separate change).

### Required companion fix

`isNotificato: false` is also placeholders' default, so anything that buckets by `isNotificato` alone now wrongly catches placeholders as "needs notifying." Two call sites must additionally gate on `hasId`:

- `src/application/email/boxes.ts:506-515` (`pianiPersDaInviare`/`pianiPersInviati` split)
- `src/application/pipelines/emailSteps.ts:453-458` (`PianiDaNotificare` log count)

Both change `!i.isNotificato` → `i.hasId && !i.isNotificato`.

### Out of scope

- `DocumentiClasseProvider` (`focus.classe.documenti`) stays class-tag-driven — it's a general audit-trail feed (verbali, non-student docs included), not a per-student computation.
- Multi-class aggregation (`classiCompetenza`) and articolazione handling: untouched, same per-class-id loop as today.

## Testing

`test/unit/application/context-engine/piani-pers-classe-provider.test.ts` fixtures are currently internally inconsistent (LOG_DOCS `SOTTOTIPO` doesn't match the corresponding student's `PIANI.TIPO` in `fixtureTables()`) — the join makes this load-bearing, so fixtures need rewriting to align `PIANI.STUDENTE/TIPO` with `LOG_DOCS.UTENTI/SOTTOTIPO`. Add cases: moved-out student excluded, moved-in student included, inactive student excluded, piano-with-no-doc placeholder, `hasId` gating in `boxes.ts`/`emailSteps.ts` tests.

`test/unit/application/document-generation-service.test.ts` and `test/unit/application/email-boxes.test.ts` read `pianiPersonalizzati.elenco` — check for newly-surfaced placeholders from existing fixture PIANI rows.
