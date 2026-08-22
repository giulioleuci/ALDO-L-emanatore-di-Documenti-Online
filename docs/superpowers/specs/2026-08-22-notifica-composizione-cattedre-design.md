# Design: Notifica email della composizione della cattedra (PER_DOCENTE)

**Data:** 2026-08-22
**Stato:** Approvato (brainstorming)
**Spec toccate:** `02_CDU_STRUTTURA.md` §5, `GUIDA_USO_PLACEHOLDER.md`

## Problema

Serve inviare a ogni docente (batch) la composizione della propria cattedra: elenco
delle classi in cui insegna + materie effettivamente insegnate in ciascuna classe.

## Stato attuale (cosa esiste già)

- Pipeline email data-driven completa: riga `CONF_MAIL` →
  `EmailNotificationService.enumerateTargets` → `EmailBatchService.batchSendHandler`
  (JobRunnerLib, checkpoint quota/resume).
- `ProcessoInvio.PER_DOCENTE` (`emailSteps.ts:56`): un target per attore effettivo,
  ciascuno con `classiCompetenza` = classi dove il docente compare nel CDC.
  Lo split titolare/supplente è fatto da `expandDocenteActors` via RoleResolutionLib
  (`resolveEffectiveDocenti`) secondo `CONF_MAIL.SUPPLENTI`.
- CDU email recipe `DOCENTE_COMPLETO`; sezione `destinatario` costruita da
  `BuildCDUStep.buildDestinatario` (`emailSteps.ts:159-209`).
- Box email esistenti in `src/application/email/boxes.ts`: carenze, documenti,
  documenti_dipartimento, cartelle, piani_pers_*, note, assenze, testo_dinamico.
- Resolver effettivo: `AldoTeachingAssignmentResolver.resolveConsiglio(classe, data)`
  (SUPPLENZE → VARIAZIONI_CATTEDRA → CLASSI), restituisce `TeachingAssignment[]`
  con `docenteEffettivo`, slot `{materia, kind, specifica}`.

### Gap

1. `destinatario.contesto.materieCompetenza` è **stub** (sempre `[]`,
   documentato in `02 §5`, `emailSteps.ts:201`).
2. Nessun dato CDU pairing classe↔materie per il destinatario.
3. Nessun box che componga l'elenco "Classe — Materie".

## Decisioni (con l'utente)

| Decisione | Scelta |
|---|---|
| Ambito | Batch a tutti i docenti, nuovo pattern `CONF_MAIL` con `PROCESSO=PER_DOCENTE` |
| Forma dati | Lista piatta ricca + struttura per-classe |
| Supplenze | Materie **effettive alla data di invio** (stesso resolver dei target) |
| Presentazione | Nuovo box dedicato `cattedre` **e** `testo_dinamico` per formati custom |
| Library-first | GasLibraryFactory non offre lookup inverso attore→cattedre; la composizione resta ALDO-domain su `RoleResolutionLib`. Nessuna estensione libreria |

## Design

### 1. Arricchimento CDU (`BuildCDUStep`)

La spec `02 §5` assegna la sezione `destinatario` esclusivamente a `BuildCDUStep`;
lo stub viene riempito lì (Approccio A scartando interceptor/provider, che
violerebbero la §5).

Nuove dipendenze del costruttore: `ITeachingAssignmentResolver`, `IClasseRepository`
(wiring in `Bootstrap.ts`).

Per un `EmailTarget` con `tipo === 'docente'`, per ogni `classeId` in
`t.classiCompetenza`:

```
classe = classi.findById(classeId)
assignments = resolver.resolveConsiglio(classe, now)      // esclude IRC/ALT di default
mie = assignments.filter(a => a.docenteEffettivo.id === t.docenteEmail)
```

Da `mie` si costruiscono i SubjectVM con il mapper standard
(`buildSubjectVm(materia, { indirizzo, isITP, specificita })`) — stesse forme di
`focus.classe.materie`.

#### Nuova forma di `destinatario.contesto` (`Cdu.ts`)

```yaml
contesto:
  sostituisce: PersonVM | null       # invariato
  classiCompetenza: string[]         # invariato
  materieCompetenza: SubjectVM[]     # STUB RIMOSSO: tutte le materie effettive del
                                     #   destinatario, deduplicate su tutte le classi
  cattedre: CattedraVM[]             # NUOVO: raggruppamento per classe

CattedraVM:
  classeId: string                   # "5AB-LC-LS"
  classeNome: string                 # nome completo della classe
  anno: number
  sezione: string
  materie: SubjectVM[]               # VM completi: sigla, nome, nomeSintetico (sintesi),
                                     #   colore1/colore2, specificita, isITP, flag esami...
```

Nota: cambia il tipo di `materieCompetenza` da `string[]` a `SubjectVM[]`. È sicuro:
il valore era sempre lo stub `[]`, nessun template può dipendere da dati reali.
I loop mostrati in `GUIDA_USO_PLACEHOLDER.md` restano validi (ora iterano oggetti).

### 2. Regole di calcolo

- **Solo target docente**: per alunno/genitori/dipartimenti i due campi restano `[]`
  (comportamento attuale invariato).
- **Effettivo alla data**: match su `docenteEffettivo` — il supplente vede la materia
  coperta; il titolare no se delegata fuori. Coerente con chi viene targeting.
- **Dedup flat**: stessa sigla su più classi appare una volta in `materieCompetenza`;
  precedenza MAIN > ITP sul flag `isITP` (regola legacy di
  `ClasseRepository.getMaterieDelDocente`).
- **IRC/ALT**: escluse di default (comportamento standard di `resolveConsiglio`).
- **Classe senza materie effettive del destinatario**: esclusa da `cattedre`; se
  nessuna classe produce materie, entrambi gli array vuoti (email comunque inviata).
- **Ordine**: `cattedre[]` segue l'ordine di `classiCompetenza` (ordine foglio CLASSI,
  già deterministico); materie nell'ordine di risoluzione del resolver.

### 3. Nuovo box `cattedre` (`boxes.ts`)

- Blocco registrato in `createBoxComposer`:
  - `id: 'cattedre'`, `supportedFormats: ['html']`, `emptyBehavior: 'HIDE'`
  - `dataExtractor: (ctx) => ctx.get('destinatario.contesto.cattedre', [])`
    (pattern già usato dal box note con `focus.carenza.note`)
  - `emptyChecker: (d) => (d as unknown[]).length === 0`
- Renderer HTML dedicato: elenco/tabella stilizzata `{{classeNome}} — {{elenco materie}}`
  con `escapeHtml`; materie come lista leggibile (`nome` o `sigla` + badge ITP).
- Titolo default "Le tue cattedre" in `DEFAULT_TITLES`.
- Configurazione: una riga `BOX_CFG` con `TIPO_BOX='cattedre'` sul pattern.

### 4. Uso operativo (nessun codice da scrivere a valle)

Riga `CONF_MAIL`: `PROCESSO=PER_DOCENTE`, scelta `SUPPLENTI`
(SOLO_TITOLARI/SOLO_SUPPLENTI/ENTRAMBI), `OGGETTO`/`CORPO`.

Esempio corpo con `testo_dinamico` (formato custom):

```
Gentile {{destinatario.anagrafica.appellativoCompleto}},

{{#bullet_list:destinatario.contesto.cattedre}}{{classeNome}} — {{#materie}}{{nome}} {{colore1}}{{/materie}}{{/bullet_list}}
```

Oppure il box standard `cattedre` senza scrivere template.

Invio batch tramite l'entry point esistente di invio pattern
(`EmailBatchService.batchSendHandler`, con test-recipient e resume quota).

### 5. Errori

- `EntityNotFoundError` su classe mancante: comportamento invariato (target fallito,
  loggato nel batch, non blocca gli altri).
- Docente non trovato in `DOCENTI`: `anagrafica` fallback attuale su email target;
  `cattedre` comunque calcolate da `docenteEmail`.
- Il calcolo cattedre non altera gate/condizioni esistenti (`ValutaCondizioniInvioStep`).

### 6. Testing

Unit (`test/unit/application/pipelines/email-steps.test.ts` e nuovo test boxes):

- Multi-classe con materie diverse: `cattedre` ordinate per classe, SubjectVM completi
- Supplenza attiva con `ENTRAMBI`: supplente vede la copertura, titolare no
- Dedup MAIN > ITP sulla flat list
- Target non-docente: campi invariati (`[]`)
- Classe IRC-only / nessuna materia: classe esclusa, email inviata comunque
- Renderer box `cattedre`: HTML atteso, HIDE quando vuoto, escaping

Fixture: estendere `fixtureTables()` con una seconda classe per docente multi-classe.

### 7. Aggiornamenti spec

- `02_CDU_STRUTTURA.md` §5: rimuovere nota STUB per `materieCompetenza`, aggiungere
  `cattedre: CattedraVM[]`, tipo `SubjectVM[]` per materieCompetenza, riferimento al box.
- `GUIDA_USO_PLACEHOLDER.md`: esempio loop su `cattedre` + box `cattedre`.

## Fuori scope

- Cambio granularità invio (una email per coppia docente×classe): altererebbe i
  pattern PER_DOCENTE esistenti.
- Lookup inverso "tutte le cattedre di X" in GasLibraryFactory (nessun bisogno
  general-purpose emerso; ALDO lo compone dai suoi repository).
